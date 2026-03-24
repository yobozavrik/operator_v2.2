import type { SupabaseClient } from '@supabase/supabase-js';
import { getProducts } from '@/lib/poster-api';

export interface FloridaCatalogItem {
    product_id: number;
    product_name: string;
    category_id: number;
    category_name: string;
    unit: 'шт' | 'кг';
    poster_weight_flag: boolean;
}

const FLORIDA_CATEGORY_NAMES = new Set([
    'Вареники',
    'Верховода',
    'Голубці',
    'Готові страви',
    'Деруни',
    'Зрази',
    'Ковбаси',
    'Котлети',
    'Млинці',
    'Моті',
    'Пельмені',
    'Перець фарширований',
    'ПИРІЖЕЧКИ',
    'Сирники',
    'Страви від шефа',
    'Хачапурі',
    'Хінкалі',
    'Чебуреки',
]);

function resolvePosterCatalogUnit(row: Record<string, unknown>): 'шт' | 'кг' {
    return String(row.weight_flag || '') === '1' ? 'кг' : 'шт';
}

export async function fetchFloridaCatalogFromPoster(): Promise<FloridaCatalogItem[]> {
    const products = (await getProducts()) as Array<Record<string, unknown>>;

    return products
        .filter((row) => FLORIDA_CATEGORY_NAMES.has(String(row.category_name || '').trim()))
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

export async function syncFloridaCatalogFromPoster(supabase: SupabaseClient): Promise<FloridaCatalogItem[]> {
    const items = await fetchFloridaCatalogFromPoster();
    if (items.length === 0) return [];

    const { data: currentRows, error: currentError } = await supabase
        .schema('florida1')
        .from('production_180d_products')
        .select('product_id');

    if (currentError) {
        throw new Error(currentError.message);
    }

    const currentIds = new Set(
        (currentRows || [])
            .map((row: { product_id: unknown }) => Number(row.product_id))
            .filter((id) => Number.isFinite(id) && id > 0)
    );

    const scopedItems = items.filter((item) => currentIds.has(item.product_id));
    if (scopedItems.length === 0) return [];

    const nowIso = new Date().toISOString();
    const payload = scopedItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        category_id: item.category_id,
        category_name: item.category_name,
        unit: item.unit,
        poster_weight_flag: item.poster_weight_flag,
        source_storage_id: 41,
        refreshed_at: nowIso,
        updated_at: nowIso,
    }));

    const { error } = await supabase
        .schema('florida1')
        .from('production_180d_products')
        .upsert(payload, { onConflict: 'product_id' });

    if (error) {
        throw new Error(error.message);
    }

    return scopedItems;
}
