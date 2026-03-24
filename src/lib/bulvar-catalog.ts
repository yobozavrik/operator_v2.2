import type { SupabaseClient } from '@supabase/supabase-js';
import { getProducts } from '@/lib/poster-api';

export interface BulvarCatalogItem {
    product_id: number;
    product_name: string;
    category_id: number;
    category_name: string;
    unit: 'шт' | 'кг';
    poster_weight_flag: boolean;
}

const BULVAR_CATEGORY_IDS = new Set(['8', '10', '11', '12', '14', '29', '30', '40']);

function resolvePosterCatalogUnit(row: Record<string, unknown>): 'шт' | 'кг' {
    return String(row.weight_flag || '') === '1' ? 'кг' : 'шт';
}

export async function fetchBulvarCatalogFromPoster(): Promise<BulvarCatalogItem[]> {
    const products = (await getProducts()) as Array<Record<string, unknown>>;

    return products
        .filter((row) => BULVAR_CATEGORY_IDS.has(String(row.menu_category_id || '')))
        .map((row) => ({
            product_id: Number(row.product_id),
            product_name: String(row.product_name || '').trim(),
            category_id: Number(row.menu_category_id),
            category_name: String(row.category_name || '').trim(),
            unit: resolvePosterCatalogUnit(row),
            poster_weight_flag: String(row.weight_flag || '') === '1',
        }))
        .filter((row) => Number.isFinite(row.product_id) && row.product_id > 0 && row.product_name);
}

export async function syncBulvarCatalogFromPoster(supabase: SupabaseClient): Promise<BulvarCatalogItem[]> {
    const items = await fetchBulvarCatalogFromPoster();
    if (items.length === 0) return [];

    const nowIso = new Date().toISOString();
    const payload = items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        category_id: item.category_id,
        category_name: item.category_name,
        unit: item.unit,
        poster_weight_flag: item.poster_weight_flag,
        source_storage_id: 22,
        refreshed_at: nowIso,
        updated_at: nowIso,
    }));

    const { error } = await supabase
        .schema('bulvar1')
        .from('production_180d_products')
        .upsert(payload, { onConflict: 'product_id' });

    if (error) {
        throw new Error(error.message);
    }

    return items;
}
