-- Bulvar Step 2 (safe shadow):
-- Build parallel x3 distribution views without dropping existing dependency chain.
-- Existing views stay untouched; verification is done on *_x3 objects.

CREATE OR REPLACE VIEW bulvar1.v_bulvar_distribution_stats_catalog_14d_x3 AS
WITH params AS (
    SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date AS kyiv_today
),
catalog_products AS (
    SELECT
        p180.product_id::bigint AS product_id,
        COALESCE(NULLIF(TRIM(BOTH FROM p180.product_name), ''), p.name) AS product_name,
        COALESCE(NULLIF(TRIM(BOTH FROM p180.unit), ''), 'шт') AS unit
    FROM bulvar1.production_180d_products p180
    JOIN categories.products p
      ON p.id = p180.product_id
),
shop_to_storage AS (
    SELECT
        s.spot_id::bigint AS spot_id,
        s.name AS spot_name,
        st.storage_id
    FROM categories.spots s
    JOIN categories.storages st
      ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) =
         regexp_replace(
            replace(lower(st.storage_name), 'магазин'::text, ''::text),
            '[^а-яіїєґa-z0-9]'::text,
            ''::text,
            'g'::text
         )
    WHERE s.name !~~* '%test%'::text
      AND s.name !~~* '%тест%'::text
),
sales_14_days_raw AS (
    SELECT
        t.spot_id::bigint AS spot_id,
        ti.product_id::bigint AS product_id,
        SUM(COALESCE(ti.num, 0::numeric)) AS qty_14d_raw
    FROM categories.transactions t
    JOIN categories.transaction_items ti
      ON t.transaction_id = ti.transaction_id
    JOIN catalog_products cp
      ON cp.product_id = ti.product_id::bigint
    JOIN params p
      ON true
    WHERE t.date_close >= (p.kyiv_today - INTERVAL '14 days')
      AND t.date_close < p.kyiv_today
    GROUP BY t.spot_id::bigint, ti.product_id::bigint
),
stock_now_by_spot_product AS (
    SELECT
        sh.spot_id,
        cp.product_id,
        GREATEST(0::numeric, COALESCE(SUM(es.stock_left), 0::numeric)) AS stock_now
    FROM shop_to_storage sh
    CROSS JOIN catalog_products cp
    LEFT JOIN bulvar1.effective_stocks es
      ON es.storage_id = sh.storage_id
     AND es.ingredient_name_normalized =
         regexp_replace(lower(TRIM(BOTH FROM cp.product_name)), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
    GROUP BY sh.spot_id, cp.product_id
),
today_production AS (
    SELECT
        v_bulvar_production_only.product_id::bigint AS product_id,
        MAX(v_bulvar_production_only.product_name) AS product_name,
        SUM(v_bulvar_production_only.baked_at_factory)::numeric AS baked_at_factory
    FROM bulvar1.v_bulvar_production_only
    GROUP BY v_bulvar_production_only.product_id::bigint
),
base AS (
    SELECT
        cp.product_id,
        cp.product_name,
        cp.unit,
        sh.spot_id,
        sh.spot_name,
        COALESCE(s.qty_14d_raw, 0::numeric) AS qty_14d_raw,
        COALESCE(st.stock_now, 0::numeric) AS stock_now,
        COALESCE(tp.baked_at_factory, 0::numeric) AS baked_at_factory
    FROM shop_to_storage sh
    CROSS JOIN catalog_products cp
    LEFT JOIN sales_14_days_raw s
      ON s.spot_id = sh.spot_id
     AND s.product_id = cp.product_id
    LEFT JOIN stock_now_by_spot_product st
      ON st.spot_id = sh.spot_id
     AND st.product_id = cp.product_id
    LEFT JOIN today_production tp
      ON tp.product_id = cp.product_id
),
normalized AS (
    SELECT
        b.product_id,
        b.product_name,
        b.unit,
        b.spot_id,
        b.spot_name,
        ROUND(
            CASE
                WHEN b.unit IN ('кг', 'kg') THEN COALESCE(b.qty_14d_raw, 0::numeric) / 1000.0 / 14.0
                ELSE COALESCE(b.qty_14d_raw, 0::numeric) / 14.0
            END,
            3
        ) AS avg_sales_day,
        ROUND(GREATEST(0::numeric, COALESCE(b.stock_now, 0::numeric)), 3) AS stock_now,
        ROUND(GREATEST(0::numeric, COALESCE(b.baked_at_factory, 0::numeric)), 3) AS baked_at_factory
    FROM base b
)
SELECT
    n.product_id,
    n.product_name,
    n.spot_name,
    ROUND(n.avg_sales_day, 3) AS avg_sales_day,
    CASE
        WHEN n.unit IN ('кг', 'kg') THEN ROUND(GREATEST(0::numeric, n.avg_sales_day) * 3, 3)
        ELSE CEIL(GREATEST(0::numeric, n.avg_sales_day) * 3)::numeric
    END AS min_stock,
    ROUND(GREATEST(0::numeric, n.stock_now), 3) AS stock_now,
    ROUND(GREATEST(0::numeric, COALESCE(n.baked_at_factory, 0::numeric)), 3) AS baked_at_factory,
    CASE
        WHEN n.unit IN ('кг', 'kg') THEN
            ROUND(
                GREATEST(
                    0::numeric,
                    (GREATEST(0::numeric, n.avg_sales_day) * 3) - GREATEST(0::numeric, n.stock_now)
                ),
                3
            )
        ELSE
            GREATEST(
                0::numeric,
                CEIL(GREATEST(0::numeric, n.avg_sales_day) * 3)::numeric - GREATEST(0::numeric, n.stock_now)
            )
    END AS need_net,
    n.spot_id,
    COALESCE(n.unit, 'шт'::text) AS unit
FROM normalized n;

CREATE OR REPLACE VIEW bulvar1.v_bulvar_distribution_stats_x3 AS
SELECT
    v.product_id,
    v.product_name,
    v.spot_name,
    v.avg_sales_day,
    v.min_stock,
    v.stock_now,
    v.baked_at_factory,
    v.need_net,
    v.spot_id,
    v.unit
FROM bulvar1.v_bulvar_distribution_stats_catalog_14d_x3 v;
