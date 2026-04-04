import type { SupabaseClient } from '@supabase/supabase-js';
import { getProducts } from '@/lib/poster-api';

export interface KonditerkaCatalogItem {
    product_id: number;
    product_name: string;
    category_id: number;
    category_name: string;
    unit: '\u0448\u0442' | '\u043a\u0433';
    poster_weight_flag: boolean;
}

export const KONDITERKA_CATEGORY_IDS = new Set(['34', '35']);
export const KONDITERKA_CATEGORY_KEYWORDS = ['кондитерка', 'морозиво'] as const;

function resolvePosterCatalogUnit(row: Record<string, unknown>): '\u0448\u0442' | '\u043a\u0433' {
    return String(row.weight_flag || '') === '1' ? '\u043a\u0433' : '\u0448\u0442';
}

export async function fetchKonditerkaCatalogFromPoster(): Promise<KonditerkaCatalogItem[]> {
    const products = (await getProducts()) as Array<Record<string, unknown>>;

    return products
        .filter((row) => KONDITERKA_CATEGORY_IDS.has(String(row.menu_category_id || '')))
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

export async function syncKonditerkaCatalogFromPoster(supabase: SupabaseClient): Promise<KonditerkaCatalogItem[]> {
    const items = await fetchKonditerkaCatalogFromPoster();
    if (items.length === 0) return [];

    const nowIso = new Date().toISOString();
    const payload = items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        category_id: item.category_id,
        category_name: item.category_name,
        unit: item.unit,
        poster_weight_flag: item.poster_weight_flag,
        source_storage_id: 48,
        refreshed_at: nowIso,
        updated_at: nowIso,
    }));

    const { error } = await supabase
        .schema('konditerka1')
        .from('production_180d_products')
        .upsert(payload, { onConflict: 'product_id' });

    if (error) {
        throw new Error(error.message);
    }

    return items;
}
