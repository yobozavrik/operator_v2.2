import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth-guard';
import { Logger } from '@/lib/logger';
import { syncBranchProductionFromPoster } from '@/lib/branch-production-sync';
import { syncBulvarCatalogFromPoster } from '@/lib/bulvar-catalog';
import { syncBulvarStocksFromEdge } from '@/lib/bulvar-stock-sync';
import { applyBulvarPackagingConfigToRows, fetchBulvarExactStocks, fetchBulvarPackagingConfig } from '@/lib/bulvar-packaging';

export const dynamic = 'force-dynamic';

async function refreshBulvarProductionCatalog(supabase: SupabaseClient) {
    const { error } = await supabase
        .schema('bulvar1')
        .rpc('refresh_production_180d_products', { p_product_ids: null });

    if (error) {
        Logger.error('[bulvar Orders API] production_180d refresh failed', { error: error.message });
    }
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
            Logger.warn('[bulvar Orders API] catalog sync failed', { meta: { error: String(error) } });
        });

        // Keep Bulvar product catalog self-updated from workshop production before reading cards.
        await refreshBulvarProductionCatalog(supabase);

        const productionSync = await syncBranchProductionFromPoster(supabase, 'bulvar1', 22).catch((error) => {
            Logger.error('[bulvar Orders API] live production sync failed', { error: String(error) });
            return null;
        });
        await syncBulvarStocksFromEdge(supabase).catch((error) => {
            Logger.warn('[bulvar Orders API] stock sync failed', { meta: { error: String(error) } });
        });

        const liveTodayPosterProductIds = Array.from(
            new Set(
                (productionSync?.items || [])
                    .map((item) => Number(item.product_id))
                    .filter((id) => Number.isFinite(id) && id > 0)
            )
        );

        const { data: workshopProducts, error: workshopError } = await supabase
            .schema('bulvar1')
            .from('production_180d_products')
            .select('product_id');

        if (workshopError) {
            Logger.error('[bulvar Orders API] Workshop products query failed', { error: workshopError.message });
            return NextResponse.json({
                error: 'Database query failed',
                message: workshopError.message,
                code: 'DB_ERROR'
            }, { status: 500 });
        }

        const workshopProductIds = Array.from(
            new Set([
                ...(workshopProducts || []).map((row) => Number(row.product_id)),
                ...liveTodayPosterProductIds,
            ].filter((id) => Number.isFinite(id) && id > 0))
        );

        if (workshopProductIds.length === 0) {
            return NextResponse.json([]);
        }

        const { data, error } = await supabase
            .schema('bulvar1')
            .from('v_bulvar_distribution_stats')
            .select('product_id, product_name, spot_id, spot_name, stock_now, min_stock, avg_sales_day, need_net, unit')
            .in('product_id', workshopProductIds);

        if (error) {
            Logger.error('[bulvar Orders API] Supabase error', { error: error.message });
            return NextResponse.json({
                error: 'Database query failed',
                message: error.message,
                code: 'DB_ERROR'
            }, { status: 500 });
        }

        const rows = Array.isArray(data) ? data : [];

        const normalizedRows: Array<Record<string, unknown>> = rows.map((row: Record<string, unknown>) => {
            return {
                ...row,
                unit: String(row.unit || '').trim() || 'С€С‚',
                stock_now: Math.max(0, Number(row.stock_now) || 0),
                min_stock: Math.max(0, Number(row.min_stock) || 0),
                avg_sales_day: Math.max(0, Number(row.avg_sales_day) || 0),
                need_net: Math.max(0, Number(row.need_net) || 0),
            };
        });

        const configMap = await fetchBulvarPackagingConfig(
            supabase,
            normalizedRows.map((row) => Number(row.product_id))
        ).catch((error) => {
            Logger.warn('[bulvar Orders API] packaging config load failed', { meta: { error: String(error) } });
            return new Map();
        });

        const exactStockMap = await fetchBulvarExactStocks(
            supabase,
            normalizedRows.map((row) => Number(row.product_id))
        ).catch((error) => {
            Logger.warn('[bulvar Orders API] exact stock load failed', { meta: { error: String(error) } });
            return new Map();
        });

        return NextResponse.json(applyBulvarPackagingConfigToRows(normalizedRows, configMap, exactStockMap));

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('[bulvar Orders API] Critical Error', { error: message });
        return NextResponse.json({
            error: 'Internal Server Error',
            message: message || 'An unexpected error occurred',
            code: 'INTERNAL_ERROR'
        }, { status: 500 });
    }
}

