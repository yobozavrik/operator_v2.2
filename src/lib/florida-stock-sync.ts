import type { SupabaseClient } from '@supabase/supabase-js';

export interface FloridaStockSyncResult {
    syncedRows: number;
    syncedStorages: number;
    skippedStorages: number[];
    warnings: string[];
}

export interface FloridaEdgeStockRow {
    storage_id: number;
    spot_id: number;
    spot_name: string;
    ingredient_id: number | null;
    ingredient_name: string;
    ingredient_name_normalized: string;
    stock_left: number;
    unit: string;
}

export interface FloridaEdgeStocksResult {
    rows: FloridaEdgeStockRow[];
    successfulStorageIds: number[];
    skippedStorages: number[];
    warnings: string[];
}

interface FloridaSpotMeta {
    spot_id: number;
    spot_name: string;
}

function normalizeShopName(value: string, stripStoreWord = false): string {
    let normalized = String(value || '').toLowerCase();
    if (stripStoreWord) {
        normalized = normalized.replace(/магазин/gi, '');
    }
    return normalized.replace(/[^а-яіїєґa-z0-9]/g, '');
}

function normalizeIngredientName(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^а-яіїєґa-z0-9]/g, '');
}

function toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}

async function buildFloridaStorageToSpotMap(
    supabase: SupabaseClient
): Promise<Map<number, FloridaSpotMeta>> {
    const [spotsRes, storagesRes] = await Promise.all([
        supabase
            .schema('categories')
            .from('spots')
            .select('spot_id, name')
            .not('name', 'is', null),
        supabase
            .schema('categories')
            .from('storages')
            .select('storage_id, storage_name')
            .not('storage_name', 'is', null),
    ]);

    if (spotsRes.error) {
        throw new Error(`Failed to load spots: ${spotsRes.error.message}`);
    }
    if (storagesRes.error) {
        throw new Error(`Failed to load storages: ${storagesRes.error.message}`);
    }

    const spotByNormalizedName = new Map<string, FloridaSpotMeta>();
    (spotsRes.data || []).forEach((spot: Record<string, unknown>) => {
        const spotId = Number(spot.spot_id);
        const spotName = String(spot.name || '');
        if (!Number.isFinite(spotId) || !spotName) return;
        spotByNormalizedName.set(normalizeShopName(spotName), { spot_id: spotId, spot_name: spotName });
    });

    const storageToSpot = new Map<number, FloridaSpotMeta>();
    (storagesRes.data || []).forEach((storage: Record<string, unknown>) => {
        const storageId = Number(storage.storage_id);
        const storageName = String(storage.storage_name || '');
        if (!Number.isFinite(storageId) || !storageName) return;
        const key = normalizeShopName(storageName, true);
        const spot = spotByNormalizedName.get(key);
        if (spot) storageToSpot.set(storageId, spot);
    });

    return storageToSpot;
}

export async function fetchFloridaEdgeStocks(
    supabase: SupabaseClient
): Promise<FloridaEdgeStocksResult> {
    const warnings: string[] = [];
    const skippedStorages = new Set<number>();
    const successfulStorages = new Set<number>();

    const storageToSpot = await buildFloridaStorageToSpotMap(supabase);
    const storageIds = Array.from(storageToSpot.keys());

    if (storageIds.length === 0) {
        warnings.push('No mapped Florida storages found for edge sync.');
        return {
            rows: [],
            successfulStorageIds: [],
            skippedStorages: [],
            warnings,
        };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
    }

    const edgeUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/poster-live-stocks`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (serviceRoleKey) {
        headers.Authorization = `Bearer ${serviceRoleKey}`;
        headers.apikey = serviceRoleKey;
    }

    const edgeResponse = await fetch(edgeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ storage_ids: storageIds }),
    });

    const edgePayload = (await edgeResponse.json().catch(() => null)) as
        | {
            rows?: Array<Record<string, unknown>>;
            storages_status?: Array<Record<string, unknown>>;
            error?: string;
        }
        | null;

    if (!edgeResponse.ok) {
        const details =
            (edgePayload && typeof edgePayload.error === 'string' && edgePayload.error) ||
            `HTTP ${edgeResponse.status}`;
        throw new Error(`Edge function poster-live-stocks failed: ${details}`);
    }

    const edgeRows = Array.isArray(edgePayload?.rows) ? edgePayload.rows : [];
    const storagesStatus = Array.isArray(edgePayload?.storages_status) ? edgePayload.storages_status : [];
    storagesStatus.forEach((status: Record<string, unknown>) => {
        const storageId = Number(status.storage_id);
        const state = String(status.status || '');
        if (Number.isFinite(storageId) && state.toLowerCase() === 'success') {
            successfulStorages.add(storageId);
        }
    });

    if (edgeRows.length === 0) {
        warnings.push('Edge function returned 0 stock rows.');
    }

    const normalizedRows: FloridaEdgeStockRow[] = [];
    edgeRows.forEach((row: Record<string, unknown>) => {
        const storageId = Number(row.storage_id);
        if (!Number.isFinite(storageId) || storageId <= 0) return;

        const spot = storageToSpot.get(storageId);
        if (!spot) {
            skippedStorages.add(storageId);
            return;
        }

        const ingredientName = String(row.ingredient_name || '').trim();
        const ingredientNameNormalized = normalizeIngredientName(ingredientName);
        if (!ingredientName || !ingredientNameNormalized) return;

        const stockLeft = Math.max(
            0,
            toPositiveNumber(row.stock_left ?? row.ingredient_left ?? row.storage_ingredient_left)
        );
        const ingredientIdRaw = Number(row.ingredient_id);
        const ingredientId = Number.isFinite(ingredientIdRaw) ? ingredientIdRaw : null;

        normalizedRows.push({
            storage_id: storageId,
            spot_id: spot.spot_id,
            spot_name: spot.spot_name,
            ingredient_id: ingredientId,
            ingredient_name: ingredientName,
            ingredient_name_normalized: ingredientNameNormalized,
            stock_left: stockLeft,
            unit: String(row.unit || row.ingredient_unit || ''),
        });
    });

    return {
        rows: normalizedRows,
        successfulStorageIds: Array.from(successfulStorages),
        skippedStorages: Array.from(skippedStorages),
        warnings,
    };
}

export async function syncFloridaStocksFromEdge(
    supabase: SupabaseClient
): Promise<FloridaStockSyncResult> {
    const snapshotIso = new Date().toISOString();
    const edgeResult = await fetchFloridaEdgeStocks(supabase);

    const upsertRows = edgeResult.rows.map((row) => ({
        ...row,
        source: 'poster_edge',
        snapshot_at: snapshotIso,
        updated_at: snapshotIso,
    }));

    if (upsertRows.length > 0) {
        for (const chunk of chunkArray(upsertRows, 1000)) {
            const { error } = await supabase
                .schema('florida1')
                .from('effective_stocks')
                .upsert(chunk, { onConflict: 'storage_id,ingredient_name_normalized' });

            if (error) {
                throw new Error(`Failed to upsert florida1.effective_stocks: ${error.message}`);
            }
        }
    }

    const cleanupStorageIds = edgeResult.successfulStorageIds.length > 0
        ? edgeResult.successfulStorageIds
        : Array.from(new Set(upsertRows.map((row) => Number(row.storage_id))));

    if (cleanupStorageIds.length > 0) {
        const { error: cleanupError } = await supabase
            .schema('florida1')
            .from('effective_stocks')
            .delete()
            .in('storage_id', cleanupStorageIds)
            .lt('updated_at', snapshotIso);

        if (cleanupError) {
            throw new Error(`Failed to cleanup stale florida1.effective_stocks rows: ${cleanupError.message}`);
        }
    }

    return {
        syncedRows: upsertRows.length,
        syncedStorages: cleanupStorageIds.length,
        skippedStorages: edgeResult.skippedStorages,
        warnings: edgeResult.warnings,
    };
}
