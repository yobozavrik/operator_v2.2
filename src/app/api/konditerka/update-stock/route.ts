import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { createServiceRoleClient } from '@/lib/branch-api';
import { syncKonditerkaLiveDataFromEdge } from '@/lib/konditerka-live-sync';
import { syncKonditerkaStocksFromEdge } from '@/lib/konditerka-stock-sync';
import { fetchKonditerkaTodayProduction } from '@/lib/konditerka-production-source';
import { syncKonditerkaCatalogFromPoster } from '@/lib/konditerka-catalog';

export const dynamic = 'force-dynamic';

function toPositiveInt(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.trunc(raw);
}

function toSafeNumber(value: unknown): number {
    const raw = Number(value);
    if (Number.isFinite(raw)) return raw;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

export async function POST() {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    try {
        console.time('[Konditerka Stock Update] Total duration');

        const supabase = createServiceRoleClient();

        const { data: storageRows, error: storageErr } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_distribution_stats')
            .select('storage_id');

        if (storageErr) {
            throw new Error(`Failed to load Konditerka storage mapping: ${storageErr.message}`);
        }

        const shopStorageIds = Array.from(
            new Set(
                ((storageRows || []) as Array<Record<string, unknown>>)
                    .map((row) => toPositiveInt(row.storage_id))
                    .filter((id) => id > 0 && id !== 48)
            )
        ).sort((a, b) => a - b);

        let edgeSync = {
            businessDate: '',
            stockRows: 0,
            stockStorages: 0,
            manufactureHeaders: 0,
            manufactureItems: 0,
            totalProductionQty: 0,
        };
        let edgeSyncError: string | null = null;
        try {
            edgeSync = await syncKonditerkaLiveDataFromEdge({
                force: true,
                shopStorageIds,
            });
        } catch (edgeError: unknown) {
            edgeSyncError = edgeError instanceof Error ? edgeError.message : String(edgeError);
            console.warn('[Konditerka Stock Update] Edge production sync failed, continuing with stock sync', edgeSyncError);
        }
        const stockSync = await syncKonditerkaStocksFromEdge(supabase, shopStorageIds);

        const { data: leftoversRows, error: leftoversError } = await supabase
            .schema('konditerka1')
            .from('leftovers')
            .select('storage_id, storage_name, product_id, product_name, count, unit, updated_at')
            .order('storage_id', { ascending: true });

        if (leftoversError) {
            throw new Error(`Failed to load konditerka leftovers: ${leftoversError.message}`);
        }

        const groupedByStorage = new Map<
            number,
            { storage_id: number; storage_name: string; leftovers: Array<Record<string, unknown>> }
        >();

        for (const row of (leftoversRows || []) as Array<Record<string, unknown>>) {
            const storageId = toPositiveInt(row.storage_id);
            if (storageId <= 0) continue;

            const storageName = String(row.storage_name || '').trim() || `Storage ${storageId}`;
            if (!groupedByStorage.has(storageId)) {
                groupedByStorage.set(storageId, {
                    storage_id: storageId,
                    storage_name: storageName,
                    leftovers: [],
                });
            }

            groupedByStorage.get(storageId)!.leftovers.push({
                ingredient_id: toPositiveInt(row.product_id),
                ingredient_name: String(row.product_name || '').trim(),
                storage_ingredient_left: Math.max(0, toSafeNumber(row.count)),
                ingredient_unit: String(row.unit || 'шт').trim() || 'шт',
                updated_at: row.updated_at,
            });
        }

        const data = Array.from(groupedByStorage.values());

        const { data: productionRows, error: productionError } = await supabase
            .schema('konditerka1')
            .from('v_konditerka_production_only')
            .select('product_name, baked_at_factory');

        if (productionError) {
            throw new Error(`Failed to load konditerka production: ${productionError.message}`);
        }

        let manufactures = ((productionRows || []) as Array<Record<string, unknown>>).map((row) => ({
            product_name: String(row.product_name || '').trim(),
            product_num: Math.max(0, toSafeNumber(row.baked_at_factory)),
        }));
        manufactures = manufactures.filter((row) => row.product_num > 0);

        if (manufactures.length === 0) {
            try {
                const liveRows = await fetchKonditerkaTodayProduction(supabase);
                manufactures = liveRows
                    .map((row) => ({
                        product_name: String(row.product_name || '').trim(),
                        product_num: Math.max(0, toSafeNumber(row.baked_at_factory)),
                    }))
                    .filter((row) => row.product_num > 0);
            } catch (fallbackError) {
                console.warn('[Konditerka Stock Update] production fallback failed', fallbackError);
            }
        }

        let recalcTriggered = false;
        let recalcError: string | null = null;
        let catalogRefreshError: string | null = null;

        const { error: refreshCatalogError } = await supabase
            .schema('konditerka1')
            .rpc('refresh_production_180d_products', { p_product_ids: null });

        if (refreshCatalogError) {
            catalogRefreshError = refreshCatalogError.message;
        }

        await syncKonditerkaCatalogFromPoster(supabase).catch((error) => {
            catalogRefreshError = catalogRefreshError
                ? `${catalogRefreshError}; poster catalog sync failed: ${String(error)}`
                : `poster catalog sync failed: ${String(error)}`;
            return [];
        });

        const { error: rpcError } = await supabase.schema('konditerka1').rpc('fn_full_recalculate_all');

        if (rpcError) {
            recalcError = rpcError.message;
        } else {
            recalcTriggered = true;
        }

        console.timeEnd('[Konditerka Stock Update] Total duration');

        return NextResponse.json({
            success: true,
            source: 'edge_sync_to_supabase',
            edgeSync: {
                businessDate: edgeSync.businessDate,
                stockRows: edgeSync.stockRows,
                stockStorages: edgeSync.stockStorages,
                manufactureHeaders: edgeSync.manufactureHeaders,
                manufactureItems: edgeSync.manufactureItems,
                totalProductionQty: edgeSync.totalProductionQty,
            },
            edgeSyncError,
            stockSync,
            data,
            manufactures,
            syncedRows: (leftoversRows || []).length,
            syncedStorages: data.length,
            manufacturesCount: manufactures.length,
            catalogRefreshError,
            recalcTriggered,
            recalcError,
            timestamp: new Date().toISOString(),
        });
    } catch (error: unknown) {
        console.error('[Konditerka Stock Update] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
