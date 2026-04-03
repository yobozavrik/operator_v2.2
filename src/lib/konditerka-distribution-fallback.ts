import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedDistributionRow } from '@/lib/branch-api';
import { normalizeKonditerkaUnit } from '@/lib/konditerka-dictionary';

interface RuntimeStoreRow {
    spot_id: number;
    spot_name: string;
    stock_now: number;
    norm_3_days: number;
    need_net: number;
    priority: number;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(',', '.'));
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function toPositiveInt(value: unknown): number | null {
    const parsed = Math.trunc(toNumber(value));
    return parsed > 0 ? parsed : null;
}

export async function buildKonditerkaFallbackStoresForProduct(
    supabase: SupabaseClient,
    productId: number
): Promise<RuntimeStoreRow[]> {
    const { data: baseRows, error: baseError } = await supabase
        .schema('konditerka1')
        .from('v_konditerka_distribution_stats')
        .select('spot_id, spot_name, storage_id');

    if (baseError) {
        throw new Error(`Failed to load store mapping: ${baseError.message}`);
    }

    const storesMap = new Map<number, { spot_id: number; spot_name: string; storage_id: number | null }>();
    for (const raw of (baseRows || []) as Array<Record<string, unknown>>) {
        const spotId = toPositiveInt(raw.spot_id);
        if (!spotId) continue;

        const spotName = String(raw.spot_name || '').trim();
        const storageId = toPositiveInt(raw.storage_id);
        if (!storesMap.has(spotId)) {
            storesMap.set(spotId, {
                spot_id: spotId,
                spot_name: spotName || `Spot ${spotId}`,
                storage_id: storageId,
            });
        }
    }

    if (storesMap.size === 0) {
        throw new Error('No active Konditerka stores found for fallback distribution');
    }

    const storageIds = Array.from(
        new Set(
            Array.from(storesMap.values())
                .map((store) => store.storage_id)
                .filter((value): value is number => Number.isFinite(value) && Number(value) > 0)
        )
    );

    const stockByStorage = new Map<number, number>();
    if (storageIds.length > 0) {
        const { data: leftoversRows, error: leftoversError } = await supabase
            .schema('konditerka1')
            .from('leftovers')
            .select('storage_id, count')
            .eq('product_id', productId)
            .in('storage_id', storageIds);

        if (leftoversError) {
            throw new Error(`Failed to load leftovers fallback: ${leftoversError.message}`);
        }

        for (const row of (leftoversRows || []) as Array<Record<string, unknown>>) {
            const storageId = toPositiveInt(row.storage_id);
            if (!storageId) continue;
            stockByStorage.set(storageId, Math.max(0, toNumber(row.count)));
        }
    }

    const fallbackRows: RuntimeStoreRow[] = Array.from(storesMap.values()).map((store) => ({
        spot_id: store.spot_id,
        spot_name: store.spot_name,
        stock_now: store.storage_id ? stockByStorage.get(store.storage_id) ?? 0 : 0,
        norm_3_days: 0,
        need_net: 0,
        priority: 999,
    }));

    fallbackRows.sort((a, b) => a.stock_now - b.stock_now || a.spot_name.localeCompare(b.spot_name));
    fallbackRows.forEach((row, index) => {
        row.priority = index + 1;
    });

    return fallbackRows;
}

export async function buildKonditerkaFallbackAllocationRows(
    supabase: SupabaseClient,
    params: {
        productId: number;
        productName?: string;
        productionQuantity: number;
        unit?: string;
    }
): Promise<NormalizedDistributionRow[]> {
    const runtimeStores = await buildKonditerkaFallbackStoresForProduct(supabase, params.productId);
    const productName = String(params.productName || '').trim() || `Product ${params.productId}`;
    const unit = normalizeKonditerkaUnit(params.unit, productName);

    return runtimeStores.map((store) => ({
        productId: params.productId,
        productName,
        storeId: store.spot_id,
        storeName: store.spot_name,
        unit,
        stockNow: store.stock_now,
        minStock: store.norm_3_days,
        avgSalesDay: 0,
        needNet: store.need_net,
        bakedAtFactory: params.productionQuantity,
    }));
}
