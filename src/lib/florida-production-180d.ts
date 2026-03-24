import type { SupabaseClient } from '@supabase/supabase-js';
export const FLORIDA_WORKSHOP_STORAGE_ID = 41;

export const FLORIDA_WORKSHOP_CATEGORIES = [
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
] as const;

export interface FloridaProduction180dRow {
    product_id: number;
    product_name: string;
    unit?: string;
    poster_weight_flag?: boolean;
    category_id?: number;
    category_name?: string;
    total_qty_180d: number;
    prod_days: number;
    avg_qty_per_prod_day: number;
    avg_qty_per_calendar_day: number;
    min_day_qty: number;
    max_day_qty: number;
    last_manufacture_at: string | null;
    network_min_stock?: number;
    network_avg_sales_day?: number;
    network_stock_now?: number;
    shops_count?: number;
    source_storage_id: number;
    refreshed_at: string;
    updated_at?: string;
}

function buildFloridaProduction180dSqlLegacy() {
    const categoriesSql = FLORIDA_WORKSHOP_CATEGORIES.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

    return `
WITH filtered_items AS (
    SELECT
        mi.product_id,
        COALESCE(NULLIF(TRIM(mi.product_name), ''), p.name) AS product_name,
        m.manufacture_date::date AS production_day,
        COALESCE(mi.quantity, 0)::numeric AS quantity,
        m.manufacture_date
    FROM categories.manufacture_items mi
    JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
    JOIN categories.products p ON p.id = mi.product_id
    JOIN categories.categories c ON c.category_id = p.category_id
    WHERE m.storage_id = ${FLORIDA_WORKSHOP_STORAGE_ID}
      AND m.manufacture_date >= ((now() AT TIME ZONE 'Europe/Kyiv')::date - INTERVAL '180 days')
      AND m.manufacture_date < (((now() AT TIME ZONE 'Europe/Kyiv')::date) + INTERVAL '1 day')
      AND mi.is_deleted IS NOT TRUE
      AND c.category_name = ANY (ARRAY[${categoriesSql}]::text[])
),
daily AS (
    SELECT
        product_id,
        product_name,
        production_day,
        SUM(quantity) AS qty_day
    FROM filtered_items
    GROUP BY product_id, product_name, production_day
),
agg AS (
    SELECT
        product_id,
        MAX(product_name) AS product_name,
        SUM(qty_day) AS total_qty_180d,
        COUNT(*)::integer AS prod_days,
        CASE WHEN COUNT(*) > 0 THEN SUM(qty_day) / COUNT(*) ELSE 0 END AS avg_qty_per_prod_day,
        SUM(qty_day) / 180.0 AS avg_qty_per_calendar_day,
        MIN(qty_day) AS min_day_qty,
        MAX(qty_day) AS max_day_qty,
        MAX(production_day)::timestamp AS last_manufacture_at
    FROM daily
    GROUP BY product_id
)
SELECT
    a.product_id::integer AS product_id,
    a.product_name,
    ROUND(a.total_qty_180d, 2)::numeric AS total_qty_180d,
    a.prod_days,
    ROUND(a.avg_qty_per_prod_day, 2)::numeric AS avg_qty_per_prod_day,
    ROUND(a.avg_qty_per_calendar_day, 2)::numeric AS avg_qty_per_calendar_day,
    ROUND(a.min_day_qty, 2)::numeric AS min_day_qty,
    ROUND(a.max_day_qty, 2)::numeric AS max_day_qty,
    a.last_manufacture_at,
    ${FLORIDA_WORKSHOP_STORAGE_ID}::integer AS source_storage_id,
    NOW() AS refreshed_at
FROM agg a
ORDER BY a.total_qty_180d DESC, a.product_name ASC
`.trim();
}

export async function fetchFloridaProduction180dRows(
    supabase: SupabaseClient
): Promise<FloridaProduction180dRow[]> {
    const tableSelect =
        'product_id, product_name, unit, poster_weight_flag, category_id, category_name, total_qty_180d, prod_days, avg_qty_per_prod_day, avg_qty_per_calendar_day, min_day_qty, max_day_qty, last_manufacture_at, network_min_stock, network_avg_sales_day, network_stock_now, shops_count, source_storage_id, refreshed_at, updated_at';

    const { data: tableData, error: tableError } = await supabase
        .schema('florida1')
        .from('production_180d_products')
        .select(tableSelect)
        .order('total_qty_180d', { ascending: false });

    if (!tableError) {
        return ((tableData as FloridaProduction180dRow[]) || []).map((row) => ({
            ...row,
            product_id: Number(row.product_id),
            total_qty_180d: Number(row.total_qty_180d) || 0,
            prod_days: Number(row.prod_days) || 0,
            avg_qty_per_prod_day: Number(row.avg_qty_per_prod_day) || 0,
            avg_qty_per_calendar_day: Number(row.avg_qty_per_calendar_day) || 0,
            min_day_qty: Number(row.min_day_qty) || 0,
            max_day_qty: Number(row.max_day_qty) || 0,
            network_min_stock: Number(row.network_min_stock) || 0,
            network_avg_sales_day: Number(row.network_avg_sales_day) || 0,
            network_stock_now: Number(row.network_stock_now) || 0,
            shops_count: Number(row.shops_count) || 0,
            source_storage_id: Number(row.source_storage_id) || FLORIDA_WORKSHOP_STORAGE_ID,
        }));
    }

    const tableErrMsg = String(tableError?.message || '').toLowerCase();
    const tableMissing =
        tableErrMsg.includes('production_180d_products') ||
        tableErrMsg.includes('does not exist') ||
        tableErrMsg.includes('42p01');

    if (!tableMissing) {
        throw new Error(tableError.message);
    }

    // Legacy fallback for environments where florida1.production_180d_products is not applied yet.
    const query = buildFloridaProduction180dSqlLegacy();
    const { data: legacyData, error: legacyError } = await supabase.rpc('exec_sql', { query });

    if (legacyError) {
        throw new Error(legacyError.message);
    }

    return ((legacyData as FloridaProduction180dRow[]) || []).map((row) => ({
        ...row,
        product_id: Number(row.product_id),
        total_qty_180d: Number(row.total_qty_180d) || 0,
        prod_days: Number(row.prod_days) || 0,
        avg_qty_per_prod_day: Number(row.avg_qty_per_prod_day) || 0,
        avg_qty_per_calendar_day: Number(row.avg_qty_per_calendar_day) || 0,
        min_day_qty: Number(row.min_day_qty) || 0,
        max_day_qty: Number(row.max_day_qty) || 0,
        network_min_stock: Number(row.network_min_stock) || 0,
        network_avg_sales_day: Number(row.network_avg_sales_day) || 0,
        network_stock_now: Number(row.network_stock_now) || 0,
        shops_count: Number(row.shops_count) || 0,
        source_storage_id: Number(row.source_storage_id) || FLORIDA_WORKSHOP_STORAGE_ID,
    }));
}

export async function fetchFloridaProduction180dProductIds(
    supabase: SupabaseClient
): Promise<number[]> {
    const rows = await fetchFloridaProduction180dRows(supabase);

    return Array.from(
        new Set(
            rows
                .map((row) => Number(row.product_id))
                .filter((id) => Number.isFinite(id) && id > 0)
        )
    );
}
