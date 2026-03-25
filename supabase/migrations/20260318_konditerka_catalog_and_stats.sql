-- Konditerka: ensure auto-upsert catalog for new products and stable stats view.
-- Goal:
-- 1) New products from live production and leftovers must appear in cards/distribution.
-- 2) avg_sales_day/min_stock are derived from real sales where available.

CREATE TABLE IF NOT EXISTS konditerka1.production_180d_products (
    product_id integer PRIMARY KEY,
    product_name text NOT NULL,
    source_storage_id integer NOT NULL DEFAULT 48,
    refreshed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_konditerka_prod180_updated_at
ON konditerka1.production_180d_products (updated_at DESC);

CREATE OR REPLACE FUNCTION konditerka1.refresh_production_180d_products(
    p_product_ids integer[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, konditerka1, categories
AS $function$
BEGIN
    INSERT INTO konditerka1.production_180d_products (
        product_id,
        product_name,
        source_storage_id,
        refreshed_at,
        updated_at
    )
    SELECT
        mi.product_id,
        MAX(mi.product_name) AS product_name,
        48 AS source_storage_id,
        now() AS refreshed_at,
        now() AS updated_at
    FROM categories.manufacture_items mi
    JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
    WHERE m.storage_id = 48
      AND m.manufacture_date >= (CURRENT_DATE - interval '180 days')
      AND mi.is_deleted IS NOT TRUE
      AND (p_product_ids IS NULL OR mi.product_id = ANY(p_product_ids))
    GROUP BY mi.product_id
    ON CONFLICT (product_id) DO UPDATE
    SET
        product_name = EXCLUDED.product_name,
        source_storage_id = EXCLUDED.source_storage_id,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;

    -- Also keep products that came from leftovers (live stocks), even if production history is not yet present.
    INSERT INTO konditerka1.production_180d_products (
        product_id,
        product_name,
        source_storage_id,
        refreshed_at,
        updated_at
    )
    SELECT
        l.product_id,
        MAX(l.product_name) AS product_name,
        48 AS source_storage_id,
        now() AS refreshed_at,
        now() AS updated_at
    FROM konditerka1.leftovers l
    WHERE l.product_id IS NOT NULL
      AND l.product_name IS NOT NULL
      AND (p_product_ids IS NULL OR l.product_id = ANY(p_product_ids))
    GROUP BY l.product_id
    ON CONFLICT (product_id) DO UPDATE
    SET
        product_name = EXCLUDED.product_name,
        source_storage_id = EXCLUDED.source_storage_id,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE OR REPLACE VIEW konditerka1.v_konditerka_distribution_stats AS
WITH shop_to_storage AS (
    SELECT
        s.spot_id::integer AS spot_id,
        s.name AS spot_name,
        st.storage_id::integer AS storage_id
    FROM categories.spots s
    JOIN categories.storages st
      ON regexp_replace(lower(s.name), '[^а-яієїa-z0-9]'::text, ''::text, 'g'::text)
       = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яієїa-z0-9]'::text, ''::text, 'g'::text)
    WHERE s.name NOT ILIKE '%test%'
      AND s.name NOT ILIKE '%тест%'
),
legacy_orders AS (
    SELECT
        vo."код_продукту"::integer AS product_id,
        vo."назва_продукту"::text AS product_name,
        vo."назва_магазину"::text AS spot_name,
        COALESCE(vo.avg_sales_day, 0)::numeric AS avg_sales_day,
        COALESCE(vo.min_stock, 0)::numeric AS min_stock
    FROM konditerka1.v_konditerka_orders vo
),
catalog_products AS (
    SELECT DISTINCT
        lo.product_id,
        MAX(lo.product_name) AS product_name
    FROM legacy_orders lo
    GROUP BY lo.product_id

    UNION

    SELECT DISTINCT
        p.product_id::integer AS product_id,
        p.product_name::text AS product_name
    FROM konditerka1.production_180d_products p
    WHERE p.product_id IS NOT NULL

    UNION

    SELECT DISTINCT
        l.product_id::integer AS product_id,
        MAX(l.product_name)::text AS product_name
    FROM konditerka1.leftovers l
    WHERE l.product_id IS NOT NULL
    GROUP BY l.product_id
),
sales_14_days AS (
    SELECT
        t.spot_id::integer AS spot_id,
        ti.product_id::integer AS product_id,
        (SUM(COALESCE(ti.num, 0)::numeric) / 14.0) AS avg_14d
    FROM categories.transactions t
    JOIN categories.transaction_items ti ON ti.transaction_id = t.transaction_id
    WHERE t.date_close >= (CURRENT_DATE - INTERVAL '14 days')
      AND t.date_close < CURRENT_DATE
    GROUP BY t.spot_id, ti.product_id
),
rows_base AS (
    SELECT
        cp.product_id,
        cp.product_name,
        ss.spot_id,
        ss.spot_name,
        ss.storage_id,
        COALESCE(s14.avg_14d, lo.avg_sales_day, 0)::numeric AS avg_sales_day_raw,
        GREATEST(
            COALESCE(lo.min_stock, 0)::numeric,
            CEIL(COALESCE(s14.avg_14d, lo.avg_sales_day, 0)::numeric * 1.5)
        )::numeric AS min_stock_raw
    FROM catalog_products cp
    CROSS JOIN shop_to_storage ss
    LEFT JOIN sales_14_days s14
      ON s14.spot_id = ss.spot_id
     AND s14.product_id = cp.product_id
    LEFT JOIN legacy_orders lo
      ON lo.product_id = cp.product_id
     AND lo.spot_name = ss.spot_name
)
SELECT
    rb.product_id,
    rb.product_name,
    rb.spot_id,
    rb.spot_name,
    rb.storage_id,
    ROUND(rb.avg_sales_day_raw::numeric, 3) AS avg_sales_day,
    GREATEST(0, ROUND(rb.min_stock_raw::numeric, 0))::integer AS min_stock,
    COALESCE(MAX(l.count), 0)::integer AS stock_now,
    COALESCE(MAX(prod.baked_at_factory), 0)::integer AS baked_at_factory,
    GREATEST(
        0,
        GREATEST(0, ROUND(rb.min_stock_raw::numeric, 0))::integer - COALESCE(MAX(l.count), 0)::integer
    )::integer AS need_net
FROM rows_base rb
LEFT JOIN konditerka1.leftovers l
  ON l.storage_id = rb.storage_id
 AND l.product_id = rb.product_id
LEFT JOIN konditerka1.v_konditerka_production_only prod
  ON prod.product_id = rb.product_id
GROUP BY
    rb.product_id,
    rb.product_name,
    rb.spot_id,
    rb.spot_name,
    rb.storage_id,
    rb.avg_sales_day_raw,
    rb.min_stock_raw;

GRANT SELECT ON konditerka1.production_180d_products TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION konditerka1.refresh_production_180d_products(integer[]) TO authenticated, service_role;
