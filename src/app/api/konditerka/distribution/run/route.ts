import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { syncKonditerkaLiveDataFromEdge } from '@/lib/konditerka-live-sync';
import {
    calculateBranchDistribution,
    createServiceRoleClient,
    type NormalizedDistributionRow,
} from '@/lib/branch-api';
import { fetchKonditerkaTodayProduction } from '@/lib/konditerka-production-source';

export const dynamic = 'force-dynamic';

function toPositiveInt(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.floor(raw));
}

async function countTodayDistributionRows(supabaseAdmin: SupabaseClient): Promise<number> {
    const { count, error } = await supabaseAdmin
        .schema('konditerka1')
        .from('v_konditerka_today_distribution')
        .select('id', { count: 'exact', head: true });

    if (error) return 0;
    return Number(count || 0);
}

async function loadKonditerkaDistributionRows(
    supabaseAdmin: SupabaseClient
): Promise<NormalizedDistributionRow[]> {
    const { data, error } = await supabaseAdmin
        .schema('konditerka1')
        .from('v_konditerka_distribution_stats')
        .select('product_id, product_name, spot_id, spot_name, stock_now, min_stock, avg_sales_day, need_net, baked_at_factory');

    if (error) {
        throw new Error(`Failed to load Konditerka distribution stats: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, unknown>>)
        .map((row) => {
            const productId = toPositiveInt(row.product_id);
            const storeId = toPositiveInt(row.spot_id);
            if (productId <= 0 || storeId <= 0) return null;

            return {
                productId,
                productName: String(row.product_name || '').trim() || `Product ${productId}`,
                storeId,
                storeName: String(row.spot_name || '').trim() || `Store ${storeId}`,
                stockNow: Math.max(0, Number(row.stock_now || 0)),
                minStock: Math.max(0, Number(row.min_stock || 0)),
                avgSalesDay: Math.max(0, Number(row.avg_sales_day || 0)),
                needNet: Math.max(0, Number(row.need_net || 0)),
                bakedAtFactory: Math.max(0, Number(row.baked_at_factory || 0)),
            } satisfies NormalizedDistributionRow;
        })
        .filter((row): row is NormalizedDistributionRow => row !== null);
}

async function runLiveFallbackDistribution(supabaseAdmin: SupabaseClient) {
    const serviceClient = createServiceRoleClient();
    const [rows, liveProduction] = await Promise.all([
        loadKonditerkaDistributionRows(serviceClient),
        fetchKonditerkaTodayProduction(serviceClient),
    ]);

    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
    const batchId = crypto.randomUUID();
    const productNameById = new Map<number, string>();
    const storeNameById = new Map<number, string>();

    rows.forEach((row) => {
        productNameById.set(row.productId, row.productName);
        storeNameById.set(row.storeId, row.storeName);
    });

    const insertRows: Array<{
        product_name: string;
        spot_name: string;
        quantity_to_ship: number;
        calculation_batch_id: string;
        business_date: string;
        delivery_status: string;
    }> = [];

    for (const item of liveProduction) {
        const qty = toPositiveInt(item.baked_at_factory);
        if (qty <= 0) continue;

        const calc = calculateBranchDistribution(rows, item.product_id, qty);
        const productName = productNameById.get(item.product_id) || item.product_name || `Product ${item.product_id}`;

        Object.entries(calc.distributed).forEach(([storeIdRaw, shipQtyRaw]) => {
            const shipQty = toPositiveInt(shipQtyRaw);
            if (shipQty <= 0) return;

            const storeId = Number(storeIdRaw);
            insertRows.push({
                product_name: productName,
                spot_name: storeNameById.get(storeId) || `Store ${storeId}`,
                quantity_to_ship: shipQty,
                calculation_batch_id: batchId,
                business_date: businessDate,
                delivery_status: 'pending',
            });
        });

        if (calc.remaining > 0) {
            insertRows.push({
                product_name: productName,
                spot_name: 'Остаток на складе',
                quantity_to_ship: toPositiveInt(calc.remaining),
                calculation_batch_id: batchId,
                business_date: businessDate,
                delivery_status: 'delivered',
            });
        }
    }

    const { error: deleteError } = await supabaseAdmin
        .schema('konditerka1')
        .from('distribution_results')
        .delete()
        .eq('business_date', businessDate);

    if (deleteError) {
        throw new Error(`Failed to clear Konditerka distribution fallback rows: ${deleteError.message}`);
    }

    if (insertRows.length > 0) {
        const { error: insertError } = await supabaseAdmin
            .schema('konditerka1')
            .from('distribution_results')
            .insert(insertRows);

        if (insertError) {
            throw new Error(`Failed to save Konditerka distribution fallback: ${insertError.message}`);
        }
    }

    return {
        batchId,
        insertedRows: insertRows.length,
        productsWithProduction: liveProduction.length,
    };
}

export async function POST() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
        return NextResponse.json({ error: 'Server Config Error: Missing Key' }, { status: 500 });
    }

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { persistSession: false } }
    );

    try {
        let syncWarning: string | null = null;

        try {
            const { data: storageRows, error: storageErr } = await supabaseAdmin
                .schema('konditerka1')
                .from('v_konditerka_distribution_stats')
                .select('storage_id');

            if (storageErr) {
                syncWarning = `storage_map_error: ${storageErr.message}`;
            } else {
                const shopStorageIds = Array.from(
                    new Set(
                        ((storageRows || []) as Array<Record<string, unknown>>)
                            .map((row) => toPositiveInt(row.storage_id))
                            .filter((id) => id > 0 && id !== 48)
                    )
                ).sort((a, b) => a - b);

                await syncKonditerkaLiveDataFromEdge({
                    force: false,
                    shopStorageIds,
                });
            }
        } catch (syncErr) {
            syncWarning = syncErr instanceof Error ? syncErr.message : String(syncErr);
        }

        const { error: refreshCatalogError } = await supabaseAdmin
            .schema('konditerka1')
            .rpc('refresh_production_180d_products', { p_product_ids: null });

        if (refreshCatalogError) {
            syncWarning = syncWarning
                ? `${syncWarning}; refresh_catalog: ${refreshCatalogError.message}`
                : `refresh_catalog: ${refreshCatalogError.message}`;
        }

        const { data: logId, error } = await supabaseAdmin
            .schema('konditerka1')
            .rpc('fn_full_recalculate_all');

        if (error) {
            if (error.code === '55P03' || error.message.includes('running') || error.message.includes('progress')) {
                return NextResponse.json({ error: 'Calculation is already running' }, { status: 409 });
            }

            const fallback = await runLiveFallbackDistribution(supabaseAdmin);
            return NextResponse.json({
                success: true,
                logId: fallback.batchId,
                mode: 'live_fallback_after_rpc_error',
                message: `SQL recalculation failed, live fallback created ${fallback.insertedRows} rows.`,
                fallback_rows: fallback.insertedRows,
                fallback_products: fallback.productsWithProduction,
                rpc_error: error.message,
                sync_warning: syncWarning,
            });
        }

        const todayRows = await countTodayDistributionRows(supabaseAdmin);
        if (todayRows > 0) {
            return NextResponse.json({
                success: true,
                logId,
                mode: 'sql_distribution',
                rows: todayRows,
                message: `Distribution generated (${todayRows} rows).`,
                sync_warning: syncWarning,
            });
        }

        const fallback = await runLiveFallbackDistribution(supabaseAdmin);
        if (fallback.insertedRows > 0) {
            return NextResponse.json({
                success: true,
                logId: fallback.batchId || logId,
                mode: 'live_fallback_after_empty_sql',
                message: `SQL returned 0 rows, live fallback created ${fallback.insertedRows} rows.`,
                fallback_rows: fallback.insertedRows,
                fallback_products: fallback.productsWithProduction,
                sync_warning: syncWarning,
            });
        }

        return NextResponse.json({
            success: true,
            logId,
            mode: 'sql_empty_no_production',
            rows: 0,
            message: 'No production available for Konditerka distribution today.',
            sync_warning: syncWarning,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
