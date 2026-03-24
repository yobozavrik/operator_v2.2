import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { syncBulvarCatalogFromPoster } from '@/lib/bulvar-catalog';
import { estimatePackagingPacks, fetchBulvarPackagingConfig } from '@/lib/bulvar-packaging';

export const dynamic = 'force-dynamic';

interface ProductionOnlyRow {
    product_id: number;
    product_name: string;
    baked_at_factory: number;
    unit?: string;
}

interface HistoricalRow {
    product_id: number;
    product_name: string;
    total_qty_180d: number;
    prod_days: number;
    avg_qty_per_prod_day: number;
    last_manufacture_at: string | null;
}

interface MetricsRow {
    product_id: number;
    product_name: string;
    stock_now: number;
    min_stock: number;
    avg_sales_day: number;
    need_net: number;
    unit?: string;
}

export async function GET() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Server Config Error', code: 'MISSING_SUPABASE_CONFIG' },
                { status: 500 }
            );
        }

        const supabase = createSupabaseClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false },
        });

        await syncBulvarCatalogFromPoster(supabase).catch((error) => {
            Logger.warn('[bulvar Production Detail] catalog sync failed', {
                meta: { error: String(error) },
            });
        });

        const { error: refreshError } = await supabase
            .schema('bulvar1')
            .rpc('refresh_production_180d_products', { p_product_ids: null });
        if (refreshError) {
            Logger.error('[bulvar Production Detail] refresh function error', { error: refreshError.message });
        }

        const productionSync = await syncBranchProductionFromPoster(supabase, 'bulvar1', 22);
        if (productionSync.warning) {
            Logger.warn('[bulvar Production Detail] production snapshot warning', {
                meta: { warning: productionSync.warning },
            });
        }

        const [
            { data: histData, error: histError },
            { data: todayData, error: todayError },
            { data: metricsData, error: metricsError },
        ] = await Promise.all([
            supabase
                .schema('bulvar1')
                .from('production_180d_products')
                .select('product_id, product_name, total_qty_180d, prod_days, avg_qty_per_prod_day, last_manufacture_at')
                .order('total_qty_180d', { ascending: false }),
            supabase
                .schema('bulvar1')
                .from('v_bulvar_production_only')
                .select('product_id, product_name, baked_at_factory'),
            supabase
                .schema('bulvar1')
                .from('v_bulvar_distribution_stats')
                .select('product_id, product_name, spot_id, spot_name, stock_now, min_stock, avg_sales_day, need_net, unit'),
        ]);

        if (histError) {
            Logger.error('[bulvar Production Detail] 180d query error', { error: histError.message });
            return NextResponse.json({
                error: 'Query failed',
                message: histError.message,
                code: 'DB_ERROR'
            }, { status: 500 });
        }

        if (todayError) {
            Logger.error('[bulvar Production Detail] today query error', { error: todayError.message });
            return NextResponse.json({
                error: 'Query failed',
                message: todayError.message,
                code: 'DB_ERROR'
            }, { status: 500 });
        }

        if (metricsError) {
            Logger.error('[bulvar Production Detail] metrics query error', { error: metricsError.message });
            return NextResponse.json({
                error: 'Query failed',
                message: metricsError.message,
                code: 'DB_ERROR'
            }, { status: 500 });
        }

        const todayMap = new Map<number, ProductionOnlyRow>();
        const liveTodayRows: ProductionOnlyRow[] = productionSync.items.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            baked_at_factory: item.quantity,
        }));
        const todayRows = liveTodayRows.length > 0 ? liveTodayRows : ((todayData || []) as ProductionOnlyRow[]);
        todayRows.forEach((row) => {
            if (row?.product_id == null) return;
            todayMap.set(Number(row.product_id), row);
        });

        const metricsRows = (metricsData || []) as Array<MetricsRow & Record<string, unknown>>;

        const metricsMap = new Map<number, { stock_now: number; min_stock: number; avg_sales_day: number; need_net: number; unit: string }>();
        (metricsRows as MetricsRow[]).forEach((row) => {
            const productId = Number(row.product_id);
            if (!Number.isFinite(productId)) return;
            const current = metricsMap.get(productId) || { stock_now: 0, min_stock: 0, avg_sales_day: 0, need_net: 0, unit: 'С€С‚' };
            const stockNow = Math.max(0, Number(row.stock_now || 0));
            const minStock = Math.max(0, Number(row.min_stock || 0));
            const avgSales = Math.max(0, Number(row.avg_sales_day || 0));
            const needNet = Math.max(0, minStock - stockNow);
            current.stock_now += stockNow;
            current.min_stock += minStock;
            current.avg_sales_day += avgSales;
            current.need_net += needNet;
            current.unit = String(row.unit || current.unit || 'С€С‚');
            metricsMap.set(productId, current);
        });

        const historicalByProduct = new Map<number, HistoricalRow>();
        ((histData || []) as HistoricalRow[]).forEach((row) => {
            const productId = Number(row.product_id);
            if (!Number.isFinite(productId) || productId <= 0) return;
            historicalByProduct.set(productId, row);
        });

        todayMap.forEach((todayRow, productId) => {
            if (historicalByProduct.has(productId)) return;
            historicalByProduct.set(productId, {
                product_id: productId,
                product_name: todayRow.product_name,
                total_qty_180d: 0,
                prod_days: 0,
                avg_qty_per_prod_day: 0,
                last_manufacture_at: null,
            });
        });

        const configMap = await fetchBulvarPackagingConfig(
            supabase,
            Array.from(historicalByProduct.keys())
        ).catch((error) => {
            Logger.warn('[bulvar Production Detail] packaging config load failed', {
                meta: { error: String(error) },
            });
            return new Map();
        });

        const merged = Array.from(historicalByProduct.values()).map((histRow) => {
            const today = todayMap.get(Number(histRow.product_id));
            const metrics = metricsMap.get(Number(histRow.product_id));
            const avgSalesRaw = Number(metrics?.avg_sales_day || 0);
            const avgSalesDay = Math.round(avgSalesRaw * 10) / 10;
            const stockNow = Number(metrics?.stock_now || 0);
            const unit = String(metrics?.unit || 'С€С‚');
            const packagingConfig = configMap.get(Number(histRow.product_id));
            const isKg = unit === 'кг' || unit === 'kg';
            const packagingEnabled = Boolean(packagingConfig && isKg);
            const minStock =
                packagingEnabled
                    ? Math.round(avgSalesDay * 3 * 10) / 10
                    : Number(metrics?.min_stock || 0);
            const needNet =
                packagingEnabled
                    ? Math.max(0, Math.round((minStock - stockNow) * 1000) / 1000)
                    : Number(metrics?.need_net || 0);
            return {
                product_id: histRow.product_id,
                product_name: histRow.product_name,
                baked_at_factory: Number(today?.baked_at_factory || 0),
                total_qty_180d: Number(histRow.total_qty_180d || 0),
                prod_days: Number(histRow.prod_days || 0),
                avg_qty_per_prod_day: Number(histRow.avg_qty_per_prod_day || 0),
                last_manufacture_at: histRow.last_manufacture_at,
                unit,
                stock_now: stockNow,
                min_stock: minStock,
                avg_sales_day: avgSalesDay,
                need_net: needNet,
                packaging_enabled: packagingEnabled,
                stock_now_packs_est: packagingEnabled ? estimatePackagingPacks(stockNow, packagingConfig) : 0,
                min_stock_packs_est: packagingEnabled ? estimatePackagingPacks(minStock, packagingConfig) : 0,
                need_net_packs_est: packagingEnabled ? estimatePackagingPacks(needNet, packagingConfig) : 0,
            };
        });

        merged.sort((a, b) => {
            if (b.baked_at_factory !== a.baked_at_factory) return b.baked_at_factory - a.baked_at_factory;
            return b.total_qty_180d - a.total_qty_180d;
        });

        return NextResponse.json(merged);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        Logger.error('[bulvar Production Detail] Critical Error', { error: message });
        return NextResponse.json({
            error: 'Internal Server Error',
            message,
            code: 'INTERNAL_ERROR'
        }, { status: 500 });
    }
}

