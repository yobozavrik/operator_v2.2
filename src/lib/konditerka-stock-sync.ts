import type { SupabaseClient } from '@supabase/supabase-js';

export interface KonditerkaStockSyncResult {
    syncedRows: number;
    syncedStorages: number;
    warnings: string[];
}

function toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
}

function toPositiveInt(value: unknown): number {
    const parsed = Math.trunc(Number(value));
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

async function fetchStorageNameMap(supabase: SupabaseClient): Promise<Map<number, string>> {
    const { data, error } = await supabase
        .schema('categories')
        .from('storages')
        .select('storage_id, storage_name')
        .not('storage_name', 'is', null);

    if (error) {
        throw new Error(`Failed to load storages map: ${error.message}`);
    }

    const map = new Map<number, string>();
    (data || []).forEach((row: Record<string, unknown>) => {
        const storageId = toPositiveInt(row.storage_id);
        if (storageId <= 0) return;
        map.set(storageId, String(row.storage_name || '').trim() || `Storage ${storageId}`);
    });
    return map;
}

export async function syncKonditerkaStocksFromEdge(
    supabase: SupabaseClient,
    storageIds: number[]
): Promise<KonditerkaStockSyncResult> {
    const warnings: string[] = [];
    const uniqueStorageIds = Array.from(new Set(storageIds.filter((id) => id > 0))).sort((a, b) => a - b);
    if (uniqueStorageIds.length === 0) {
        return { syncedRows: 0, syncedStorages: 0, warnings: ['No storage ids for stock sync.'] };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase configuration for konditerka stock sync');
    }

    const storageNameMap = await fetchStorageNameMap(supabase);
    const edgeUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/poster-live-stocks`;
    const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
        },
        body: JSON.stringify({ storage_ids: uniqueStorageIds }),
    });

    const payload = (await response.json().catch(() => null)) as
        | { rows?: Array<Record<string, unknown>>; error?: string }
        | null;

    if (!response.ok) {
        const reason =
            (payload && typeof payload.error === 'string' && payload.error) ||
            `Edge stock sync failed with HTTP ${response.status}`;
        throw new Error(reason);
    }

    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (rows.length === 0) {
        warnings.push('Edge poster-live-stocks returned 0 rows.');
    }

    const updatedAt = new Date().toISOString();
    const upsertRows = rows
        .map((row) => {
            const storageId = toPositiveInt(row.storage_id);
            const productId = toPositiveInt(row.ingredient_id);
            if (storageId <= 0 || productId <= 0) return null;

            return {
                storage_id: storageId,
                storage_name: storageNameMap.get(storageId) || `Storage ${storageId}`,
                product_id: productId,
                product_name: String(row.ingredient_name || '').trim(),
                category_name: 'poster_edge',
                count: Math.max(
                    0,
                    toPositiveNumber(row.stock_left ?? row.storage_ingredient_left ?? row.ingredient_left)
                ),
                unit: String(row.unit || row.ingredient_unit || 'шт').trim() || 'шт',
                updated_at: updatedAt,
            };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

    for (const chunk of chunkArray(upsertRows, 1000)) {
        const { error } = await supabase
            .schema('konditerka1')
            .from('leftovers')
            .upsert(chunk, { onConflict: 'storage_id,product_id' });
        if (error) {
            throw new Error(`Failed to upsert konditerka leftovers from edge: ${error.message}`);
        }
    }

    return {
        syncedRows: upsertRows.length,
        syncedStorages: uniqueStorageIds.length,
        warnings,
    };
}
