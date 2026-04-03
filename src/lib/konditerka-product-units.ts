import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeKonditerkaUnit, type ProductUnit } from '@/lib/konditerka-dictionary';

function toPositiveInt(value: unknown): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.trunc(raw);
}

export async function fetchKonditerkaProductUnitMap(
    supabase: SupabaseClient,
    productIds: number[]
): Promise<Map<number, ProductUnit>> {
    const ids = Array.from(new Set(productIds.filter((id) => Number.isFinite(id) && id > 0)));
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
        .schema('konditerka1')
        .from('production_180d_products')
        .select('product_id, unit')
        .in('product_id', ids);

    if (error) {
        throw new Error(`Failed to load Konditerka product units: ${error.message}`);
    }

    const unitMap = new Map<number, ProductUnit>();
    for (const row of (data || []) as Array<Record<string, unknown>>) {
        const productId = toPositiveInt(row.product_id);
        if (productId <= 0) continue;
        unitMap.set(productId, normalizeKonditerkaUnit(row.unit));
    }

    return unitMap;
}
