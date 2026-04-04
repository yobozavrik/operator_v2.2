import { NextResponse } from 'next/server';
import { parseISO, format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { requireAuth } from '@/lib/auth-guard';
import { getAllLeftovers } from '@/lib/poster-api';
import { getBulvarUnit } from '@/lib/bulvar-dictionary';
import { createClient } from '@/utils/supabase/server';
import {
    BRANCH_CONFIGS,
    buildBranchAnalytics,
    buildBranchOrderPlan,
    calculateBranchDistribution,
    coercePositiveInt,
    createServiceRoleClient,
    fetchBranchRows,
} from '@/lib/branch-api';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';

export const dynamic = 'force-dynamic';

const config = BRANCH_CONFIGS.bulvar;
const BULVAR_DISTRIBUTION_SELECT =
    'product_id, product_name, spot_name, spot_id, stock_now, min_stock, avg_sales_day, need_net';

function getRoutePath(request: Request): string {
    const pathname = new URL(request.url).pathname;
    return pathname.split('/').filter(Boolean).slice(2).join('/');
}

function routeNotFound(method: 'GET' | 'POST', routePath: string) {
    return NextResponse.json(
        {
            error: `Unknown bulvar ${method} route`,
            path: routePath || '(root)',
        },
        { status: 404 }
    );
}

async function handleAnalytics() {
    const supabase = createServiceRoleClient();
    const rawRows = await fetchBranchRows(
        supabase,
        config,
        BULVAR_DISTRIBUTION_SELECT
    );
    return NextResponse.json(buildBranchAnalytics(rawRows as any[], 'bulvar_name'));
}

async function handleShopStats(request: Request) {
    const { searchParams } = new URL(request.url);
    const productName =
        searchParams.get(config.shopParam) ||
        searchParams.get('product') ||
        searchParams.get('name');

    if (!productName) {
        return NextResponse.json(
            { error: `Query param "${config.shopParam}" is required` },
            { status: 400 }
        );
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
        .schema(config.schema)
        .from(config.distributionView)
        .select('spot_name, stock_now, min_stock, avg_sales_day, need_net')
        .eq('product_name', productName);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
}

async function handleOrderPlan(request: Request) {
    const { searchParams } = new URL(request.url);
    const days = coercePositiveInt(searchParams.get('days'), 1, 1, 30);

    const supabase = createServiceRoleClient();
    const rawRows = await fetchBranchRows(
        supabase,
        config,
        BULVAR_DISTRIBUTION_SELECT
    );
    const plan = buildBranchOrderPlan(rawRows as any[], days).map((item) => ({
        ...item,
        unit: getBulvarUnit(item.p_name),
    }));

    return NextResponse.json(plan);
}

async function handleCalculateDistribution(request: Request) {
    const body = await request.json().catch(() => null);
    const productId = Number(body?.productId);
    const productionQuantity = Number(body?.productionQuantity);

    if (!Number.isFinite(productId) || productId <= 0 || !Number.isFinite(productionQuantity)) {
        return NextResponse.json(
            { error: 'productId and productionQuantity are required' },
            { status: 400 }
        );
    }

    const supabase = createServiceRoleClient();
    const rawRows = await fetchBranchRows(
        supabase,
        config,
        BULVAR_DISTRIBUTION_SELECT
    );
    const result = calculateBranchDistribution(rawRows as any[], Math.trunc(productId), productionQuantity);
    return NextResponse.json(result);
}

async function handleConfirmDistribution(request: Request) {
    const body = await request.json().catch(() => null);
    const distributions = Array.isArray(body?.distributions)
        ? body.distributions.filter(
            (item: any) =>
                Number.isFinite(Number(item?.storeId)) &&
                Number.isFinite(Number(item?.productId)) &&
                Number(item?.quantity) > 0
        )
        : [];

    const totalQty = distributions.reduce((sum: number, item: any) => sum + Number(item.quantity), 0);

    return NextResponse.json({
        success: true,
        message: 'Distribution confirmed',
        count: distributions.length,
        totalQty,
    });
}

async function handleCreateOrder(request: Request) {
    const body = await request.json().catch(() => null);
    const orders = Array.isArray(body?.orders) ? body.orders : [];

    return NextResponse.json({
        success: true,
        message: 'Order accepted',
        ordersCount: orders.length,
    });
}

async function handleUpdateStock() {
    const supabase = createServiceRoleClient();
    const [allLeftovers, productionSync] = await Promise.all([
        getAllLeftovers({ categoryKeywords: null }),
        syncBranchProductionFromPoster(supabase, 'bulvar1', 22),
    ]);

    return NextResponse.json({
        success: true,
        data: allLeftovers,
        manufactures: productionSync.items.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            product_num: item.quantity,
        })),
        production_sync: {
            business_date: productionSync.businessDate,
            items_count: productionSync.itemsCount,
            total_qty: productionSync.totalQty,
            persisted: productionSync.persisted,
            warning: productionSync.warning,
        },
        timestamp: new Date().toISOString(),
    });
}

async function handleFinance(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDate =
        searchParams.get('startDate') ||
        (() => {
            const date = new Date();
            date.setDate(date.getDate() - 7);
            return date.toISOString().split('T')[0];
        })();
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0];

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.max(
        1,
        Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    );
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);

    const supabase = await createClient();

    const { data: currentData, error: currentErr } = await supabase
        .from('v_gb_finance_overview')
        .select('*')
        .eq('store_name', 'Бульвар')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

    const { data: prevData, error: prevErr } = await supabase
        .from('v_gb_finance_overview')
        .select('*')
        .eq('store_name', 'Бульвар')
        .gte('transaction_date', prevStart.toISOString().split('T')[0])
        .lte('transaction_date', prevEnd.toISOString().split('T')[0]);

    const { data: topProds, error: topErr } = await supabase
        .from('v_gb_top_products_analytics')
        .select('product_name, quantity_sold, revenue_generated')
        .eq('store_name', 'Бульвар')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

    if (currentErr || prevErr || topErr) {
        return NextResponse.json(
            { error: currentErr?.message || prevErr?.message || topErr?.message },
            { status: 500 }
        );
    }

    const storeMap = new Map<string, number>();
    const dateMap = new Map<string, { current: number; previous: number }>();
    let currentRev = 0;
    let currentProfit = 0;
    let currentQty = 0;

    for (const row of currentData || []) {
        const rev = Number(row.total_revenue) || 0;
        const prof = Number(row.total_profit) || 0;
        const qty = Number(row.total_quantity) || 0;

        currentRev += rev;
        currentProfit += prof;
        currentQty += qty;

        const storeName = row.store_name || 'Unknown';
        storeMap.set(storeName, (storeMap.get(storeName) || 0) + rev);

        const dateObj = parseISO(row.transaction_date);
        const label = diffDays <= 7 ? format(dateObj, 'EEEE', { locale: uk }) : format(dateObj, 'd MMM', { locale: uk });
        const existing = dateMap.get(label) || { current: 0, previous: 0 };
        dateMap.set(label, { ...existing, current: existing.current + rev });
    }

    let prevRev = 0;
    let prevProfit = 0;
    let prevQty = 0;
    for (const row of prevData || []) {
        const rev = Number(row.total_revenue) || 0;
        const prof = Number(row.total_profit) || 0;
        const qty = Number(row.total_quantity) || 0;

        prevRev += rev;
        prevProfit += prof;
        prevQty += qty;

        const oldDate = parseISO(row.transaction_date);
        const mappedDate = new Date(oldDate);
        mappedDate.setDate(mappedDate.getDate() + diffDays + 1);
        const label = diffDays <= 7 ? format(mappedDate, 'EEEE', { locale: uk }) : format(mappedDate, 'd MMM', { locale: uk });

        const existing = dateMap.get(label) || { current: 0, previous: 0 };
        dateMap.set(label, { ...existing, previous: existing.previous + rev });
    }

    const productMap = new Map<string, { revenue: number; qty: number }>();
    for (const row of topProds || []) {
        const existing = productMap.get(row.product_name) || { revenue: 0, qty: 0 };
        productMap.set(row.product_name, {
            revenue: existing.revenue + (Number(row.revenue_generated) || 0),
            qty: existing.qty + (Number(row.quantity_sold) || 0),
        });
    }

    const topProducts = Array.from(productMap.entries())
        .map(([name, values]) => ({ name, revenue: values.revenue, qty: values.qty }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((item, index) => ({ ...item, rank: index + 1, trend: 0 }));

    const storesData = Array.from(storeMap.entries())
        .map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    const revenueTrendData = Array.from(dateMap.entries()).map(([name, values]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        current: values.current,
        previous: values.previous,
    }));

    return NextResponse.json({
        revenueTrendData,
        storesData,
        topProducts,
        kpis: {
            current: {
                revenue: currentRev,
                profit: currentProfit,
                margin_pct: currentRev > 0 ? (currentProfit / currentRev) * 100 : 0,
                qty: currentQty,
            },
            previous: {
                revenue: prevRev,
                profit: prevProfit,
                margin_pct: prevRev > 0 ? (prevProfit / prevRev) * 100 : 0,
                qty: prevQty,
            },
        },
    });
}

export async function GET(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const routePath = getRoutePath(request);

    try {
        switch (routePath) {
            case 'analytics':
                return await handleAnalytics();
            case 'shop-stats':
                return await handleShopStats(request);
            case 'order-plan':
                return await handleOrderPlan(request);
            case 'finance':
                return await handleFinance(request);
            default:
                return routeNotFound('GET', routePath);
        }
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const routePath = getRoutePath(request);

    try {
        switch (routePath) {
            case 'calculate-distribution':
                return await handleCalculateDistribution(request);
            case 'confirm-distribution':
                return await handleConfirmDistribution(request);
            case 'create-order':
                return await handleCreateOrder(request);
            case 'update-stock':
                return await handleUpdateStock();
            default:
                return routeNotFound('POST', routePath);
        }
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
