import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { fetchFloridaEdgeStocks, syncFloridaStocksFromEdge } from '@/lib/florida-stock-sync';
import type { FloridaEdgeStockRow } from '@/lib/florida-stock-sync';
import {
    BRANCH_CONFIGS,
    buildBranchAnalytics,
    buildBranchOrderPlan,
    coercePositiveInt,
    createServiceRoleClient,
    fetchBranchRows,
} from '@/lib/branch-api';
import { fetchFloridaProduction180dProductIds } from '@/lib/florida-production-180d';
import { syncFloridaCatalogFromPoster } from '@/lib/florida-catalog';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';

export const dynamic = 'force-dynamic';

const config = BRANCH_CONFIGS.florida;

function getRoutePath(request: Request): string {
    const pathname = new URL(request.url).pathname;
    return pathname.split('/').filter(Boolean).slice(2).join('/');
}

function routeNotFound(method: 'GET' | 'POST', routePath: string) {
    return NextResponse.json(
        {
            error: `Unknown florida ${method} route`,
            path: routePath || '(root)',
        },
        { status: 404 }
    );
}

async function fetchFloridaScopedRows(select: string) {
    const supabase = createServiceRoleClient();
    const [rows, workshopProductIds] = await Promise.all([
        fetchBranchRows(supabase, config, select),
        fetchFloridaProduction180dProductIds(supabase),
    ]);

    if (workshopProductIds.length === 0) return [];

    const allowed = new Set(workshopProductIds.map((id) => Number(id)));
    return rows.filter((row) => allowed.has(Number(row.productId)));
}

async function handleAnalytics() {
    const rows = await fetchFloridaScopedRows(
        'product_id, product_name, spot_name, spot_id, stock_now, min_stock, avg_sales_day, need_net'
    );

    return NextResponse.json(buildBranchAnalytics(rows, 'florida_name'));
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
    const workshopProductIds = await fetchFloridaProduction180dProductIds(supabase);
    if (workshopProductIds.length === 0) {
        return NextResponse.json([]);
    }

    const { data, error } = await supabase
        .schema(config.schema)
        .from(config.distributionView)
        .select('product_id, spot_name, stock_now, min_stock, avg_sales_day, need_net, unit')
        .in('product_id', workshopProductIds)
        .eq('product_name', productName);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map((row: any) => ({
        spot_name: row.spot_name,
        stock_now: Number(row.stock_now || 0),
        min_stock: Number(row.min_stock || 0),
        avg_sales_day: Number(row.avg_sales_day || 0),
        need_net: Number(row.need_net || 0),
        unit: String(row.unit || 'шт'),
    })));
}

async function handleOrderPlan(request: Request) {
    const { searchParams } = new URL(request.url);
    const days = coercePositiveInt(searchParams.get('days'), 1, 1, 30);

    const rows = await fetchFloridaScopedRows(
        'product_id, product_name, spot_name, spot_id, stock_now, min_stock, avg_sales_day, need_net, unit'
    );
    const unitByName = new Map<string, string>();
    rows.forEach((row: any) => {
        if (!row?.productName) return;
        unitByName.set(String(row.productName), String(row.unit || 'шт'));
    });

    const plan = buildBranchOrderPlan(rows, days).map((item) => ({
        ...item,
        unit: unitByName.get(item.p_name) || 'шт',
    }));

    return NextResponse.json(plan);
}

async function handleCalculateDistribution() {
    return NextResponse.json(
        { error: 'Florida distribution preview in API is deprecated; use Supabase distribution run/results.' },
        { status: 410 }
    );
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

    const warnings: string[] = [];
    let edgeRowsFallback: FloridaEdgeStockRow[] | null = null;
    let sync: {
        synced_rows: number;
        synced_storages: number;
        skipped_storages: number[];
    } = {
        synced_rows: 0,
        synced_storages: 0,
        skipped_storages: [],
    };

    try {
        const syncResult = await syncFloridaStocksFromEdge(supabase);
        warnings.push(...syncResult.warnings);
        sync = {
            synced_rows: syncResult.syncedRows,
            synced_storages: syncResult.syncedStorages,
            skipped_storages: syncResult.skippedStorages,
        };
    } catch (err: unknown) {
        warnings.push(`DB stock sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        try {
            const edgeResult = await fetchFloridaEdgeStocks(supabase);
            warnings.push(...edgeResult.warnings);
            warnings.push('Edge read-only mode: stocks returned from edge function without DB persist.');
            edgeRowsFallback = edgeResult.rows;
            sync = {
                synced_rows: 0,
                synced_storages: edgeResult.successfulStorageIds.length,
                skipped_storages: edgeResult.skippedStorages,
            };
        } catch (edgeErr: unknown) {
            return NextResponse.json(
                { error: edgeErr instanceof Error ? edgeErr.message : 'Edge stock sync failed' },
                { status: 500 }
            );
        }
    }

    let todayManufactures: any[] = [];
    try {
        const productionSync = await syncBranchProductionFromPoster(supabase, 'florida1', 41);
        if (productionSync.warning) warnings.push(`Production snapshot warning: ${productionSync.warning}`);
        try {
            await syncFloridaCatalogFromPoster(supabase);
        } catch (catalogErr: unknown) {
            warnings.push(`Catalog sync failed: ${catalogErr instanceof Error ? catalogErr.message : 'Unknown error'}`);
        }
        todayManufactures = productionSync.items.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            product_num: item.quantity,
        }));
    } catch (err: unknown) {
        warnings.push(`Poster unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    if (!Array.isArray(todayManufactures) || todayManufactures.length === 0) {
        try {
            const { data: prodRows, error: prodError } = await supabase
                .schema('florida1')
                .from('v_florida_production_only')
                .select('product_id, product_name, baked_at_factory');

            if (prodError) {
                warnings.push(`Production fallback query failed: ${prodError.message}`);
            } else {
                todayManufactures = (prodRows || []).map((row: any) => ({
                    product_id: row.product_id,
                    product_name: row.product_name,
                    product_num: row.baked_at_factory,
                }));
            }
        } catch (err: unknown) {
            warnings.push(`Production fallback failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    const { data: storagesData, error: storagesError } = await supabase
        .schema('categories')
        .from('storages')
        .select('storage_id, storage_name');

    if (storagesError) {
        return NextResponse.json({ error: storagesError.message }, { status: 500 });
    }

    type StockSnapshotRow = {
        storage_id: number;
        ingredient_id: number | null;
        ingredient_name: string;
        stock_left: number;
        unit: string;
    };

    let stockRows: StockSnapshotRow[] = edgeRowsFallback || [];
    if (!edgeRowsFallback) {
        const { data: stocksData, error: stocksError } = await supabase
            .schema('florida1')
            .from('effective_stocks')
            .select('storage_id, ingredient_id, ingredient_name, stock_left, unit')
            .eq('source', 'poster_edge');

        if (stocksError) {
            return NextResponse.json({ error: stocksError.message }, { status: 500 });
        }
        stockRows = (stocksData || []) as StockSnapshotRow[];
    }

    const storageNameById = new Map<number, string>();
    (storagesData || []).forEach((storage: any) => {
        const storageId = Number(storage.storage_id);
        if (!Number.isFinite(storageId) || storageId <= 0) return;
        storageNameById.set(storageId, String(storage.storage_name || `Storage ${storageId}`));
    });

    const byStorage = new Map<number, any[]>();
    stockRows.forEach((row: any) => {
        const storageId = Number(row.storage_id);
        if (!Number.isFinite(storageId) || storageId <= 0) return;
        if (!byStorage.has(storageId)) byStorage.set(storageId, []);
        byStorage.get(storageId)!.push({
            ingredient_id: row.ingredient_id ?? null,
            ingredient_name: String(row.ingredient_name || ''),
            storage_ingredient_left: String(Math.max(0, Number(row.stock_left) || 0)),
            ingredient_unit: String(row.unit || ''),
        });
    });

    const allLeftovers = Array.from(byStorage.entries()).map(([storageId, leftovers]) => ({
        storage_id: String(storageId),
        storage_name: storageNameById.get(storageId) || `Storage ${storageId}`,
        leftovers,
    }));

    return NextResponse.json({
        success: true,
        data: allLeftovers,
        manufactures: todayManufactures,
        sync,
        warnings,
        timestamp: new Date().toISOString(),
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
                return await handleCalculateDistribution();
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
