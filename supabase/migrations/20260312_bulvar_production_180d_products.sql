-- 180-day production snapshot table for Bulvar-Autovokzal (storage_id = 22)

CREATE TABLE IF NOT EXISTS bulvar1.production_180d_products (
    product_id integer PRIMARY KEY,
    product_name text NOT NULL,
    total_qty_180d numeric(14,3) NOT NULL DEFAULT 0,
    prod_days integer NOT NULL DEFAULT 0,
    avg_qty_per_prod_day numeric(14,3) NOT NULL DEFAULT 0,
    avg_qty_per_calendar_day numeric(14,3) NOT NULL DEFAULT 0,
    min_day_qty numeric(14,3) NOT NULL DEFAULT 0,
    max_day_qty numeric(14,3) NOT NULL DEFAULT 0,
    last_manufacture_at timestamp without time zone,
    network_min_stock numeric(14,3) NOT NULL DEFAULT 0,
    network_avg_sales_day numeric(14,3) NOT NULL DEFAULT 0,
    network_stock_now numeric(14,3) NOT NULL DEFAULT 0,
    shops_count integer NOT NULL DEFAULT 0,
    source_storage_id integer NOT NULL DEFAULT 22,
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulvar_prod180_qty_desc
ON bulvar1.production_180d_products (total_qty_180d DESC);

CREATE INDEX IF NOT EXISTS idx_bulvar_prod180_updated_at
ON bulvar1.production_180d_products (updated_at DESC);

CREATE OR REPLACE FUNCTION bulvar1.refresh_production_180d_products(
    p_product_ids integer[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bulvar1, categories
AS $function$
DECLARE
    v_storage_id integer := 22;
    v_categories text[] := ARRAY[
        'Страви від шефа',
        'Хачапурі',
        'Млинці',
        'Котлети',
        'Деруни',
        'Сирники',
        'Готові страви',
        'Хінкалі'
    ];
BEGIN
    WITH prod_raw AS (
        SELECT
            mi.product_id,
            MAX(mi.product_name) AS product_name,
            m.manufacture_date::date AS prod_date,
            SUM(mi.quantity) AS qty_day,
            MAX(m.manufacture_date) AS last_ts
        FROM categories.manufacture_items mi
        JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
        JOIN categories.products p ON p.id = mi.product_id
        JOIN categories.categories c ON c.category_id = p.category_id
        WHERE m.storage_id = v_storage_id
          AND m.manufacture_date >= (CURRENT_DATE - interval '180 days')
          AND mi.is_deleted IS NOT TRUE
          AND c.category_name = ANY(v_categories)
          AND (p_product_ids IS NULL OR mi.product_id = ANY(p_product_ids))
        GROUP BY mi.product_id, m.manufacture_date::date
    ),
    prod_agg AS (
        SELECT
            product_id,
            MAX(product_name) AS product_name,
            SUM(qty_day) AS total_qty_180d,
            COUNT(*) AS prod_days,
            AVG(qty_day) AS avg_qty_per_prod_day,
            SUM(qty_day) / 180.0 AS avg_qty_per_calendar_day,
            MIN(qty_day) AS min_day_qty,
            MAX(qty_day) AS max_day_qty,
            MAX(last_ts) AS last_manufacture_at
        FROM prod_raw
        GROUP BY product_id
    ),
    ops AS (
        SELECT
            product_id,
            MAX(product_name) AS product_name,
            SUM(min_stock) AS network_min_stock,
            SUM(avg_sales_day) AS network_avg_sales_day,
            SUM(stock_now) AS network_stock_now,
            COUNT(DISTINCT spot_name) AS shops_count
        FROM bulvar1.v_bulvar_distribution_stats
        WHERE p_product_ids IS NULL OR product_id = ANY(p_product_ids)
        GROUP BY product_id
    ),
    final_data AS (
        SELECT
            p.product_id,
            p.product_name,
            ROUND(p.total_qty_180d::numeric, 3) AS total_qty_180d,
            p.prod_days,
            ROUND(p.avg_qty_per_prod_day::numeric, 3) AS avg_qty_per_prod_day,
            ROUND(p.avg_qty_per_calendar_day::numeric, 3) AS avg_qty_per_calendar_day,
            ROUND(p.min_day_qty::numeric, 3) AS min_day_qty,
            ROUND(p.max_day_qty::numeric, 3) AS max_day_qty,
            p.last_manufacture_at,
            COALESCE(ROUND(o.network_min_stock::numeric, 3), 0) AS network_min_stock,
            COALESCE(ROUND(o.network_avg_sales_day::numeric, 3), 0) AS network_avg_sales_day,
            COALESCE(ROUND(o.network_stock_now::numeric, 3), 0) AS network_stock_now,
            COALESCE(o.shops_count, 0) AS shops_count,
            v_storage_id AS source_storage_id,
            now() AS refreshed_at,
            now() AS updated_at
        FROM prod_agg p
        LEFT JOIN ops o ON o.product_id = p.product_id
    )
    INSERT INTO bulvar1.production_180d_products (
        product_id,
        product_name,
        total_qty_180d,
        prod_days,
        avg_qty_per_prod_day,
        avg_qty_per_calendar_day,
        min_day_qty,
        max_day_qty,
        last_manufacture_at,
        network_min_stock,
        network_avg_sales_day,
        network_stock_now,
        shops_count,
        source_storage_id,
        refreshed_at,
        updated_at
    )
    SELECT
        product_id,
        product_name,
        total_qty_180d,
        prod_days,
        avg_qty_per_prod_day,
        avg_qty_per_calendar_day,
        min_day_qty,
        max_day_qty,
        last_manufacture_at,
        network_min_stock,
        network_avg_sales_day,
        network_stock_now,
        shops_count,
        source_storage_id,
        refreshed_at,
        updated_at
    FROM final_data
    ON CONFLICT (product_id) DO UPDATE
    SET
        product_name = EXCLUDED.product_name,
        total_qty_180d = EXCLUDED.total_qty_180d,
        prod_days = EXCLUDED.prod_days,
        avg_qty_per_prod_day = EXCLUDED.avg_qty_per_prod_day,
        avg_qty_per_calendar_day = EXCLUDED.avg_qty_per_calendar_day,
        min_day_qty = EXCLUDED.min_day_qty,
        max_day_qty = EXCLUDED.max_day_qty,
        last_manufacture_at = EXCLUDED.last_manufacture_at,
        network_min_stock = EXCLUDED.network_min_stock,
        network_avg_sales_day = EXCLUDED.network_avg_sales_day,
        network_stock_now = EXCLUDED.network_stock_now,
        shops_count = EXCLUDED.shops_count,
        source_storage_id = EXCLUDED.source_storage_id,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;

    IF p_product_ids IS NULL THEN
        DELETE FROM bulvar1.production_180d_products t
        WHERE t.source_storage_id = v_storage_id
          AND NOT EXISTS (
              SELECT 1
              FROM categories.manufacture_items mi
              JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
              JOIN categories.products p ON p.id = mi.product_id
              JOIN categories.categories c ON c.category_id = p.category_id
              WHERE m.storage_id = v_storage_id
                AND m.manufacture_date >= (CURRENT_DATE - interval '180 days')
                AND mi.is_deleted IS NOT TRUE
                AND c.category_name = ANY(v_categories)
                AND mi.product_id = t.product_id
          );
    ELSE
        DELETE FROM bulvar1.production_180d_products t
        WHERE t.product_id = ANY(p_product_ids)
          AND t.source_storage_id = v_storage_id
          AND NOT EXISTS (
              SELECT 1
              FROM categories.manufacture_items mi
              JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
              JOIN categories.products p ON p.id = mi.product_id
              JOIN categories.categories c ON c.category_id = p.category_id
              WHERE m.storage_id = v_storage_id
                AND m.manufacture_date >= (CURRENT_DATE - interval '180 days')
                AND mi.is_deleted IS NOT TRUE
                AND c.category_name = ANY(v_categories)
                AND mi.product_id = t.product_id
          );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION bulvar1.trg_refresh_prod180_on_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_product_id integer;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
    ELSE
        v_product_id := NEW.product_id;
    END IF;

    IF v_product_id IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM bulvar1.refresh_production_180d_products(ARRAY[v_product_id]);

    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_refresh_prod180_on_items ON categories.manufacture_items;
CREATE TRIGGER tr_refresh_prod180_on_items
AFTER INSERT OR UPDATE OR DELETE ON categories.manufacture_items
FOR EACH ROW
EXECUTE FUNCTION bulvar1.trg_refresh_prod180_on_items();

CREATE OR REPLACE FUNCTION bulvar1.trg_refresh_prod180_on_manufactures()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Header changes (storage/date) can reclassify many rows, so refresh full set.
    PERFORM bulvar1.refresh_production_180d_products(NULL);
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tr_refresh_prod180_on_manufactures ON categories.manufactures;
CREATE TRIGGER tr_refresh_prod180_on_manufactures
AFTER UPDATE OF manufacture_date, storage_id OR DELETE ON categories.manufactures
FOR EACH STATEMENT
EXECUTE FUNCTION bulvar1.trg_refresh_prod180_on_manufactures();

-- Initial load
SELECT bulvar1.refresh_production_180d_products(NULL);

GRANT SELECT ON bulvar1.production_180d_products TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION bulvar1.refresh_production_180d_products(integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION bulvar1.refresh_production_180d_products(integer[]) TO authenticated;


