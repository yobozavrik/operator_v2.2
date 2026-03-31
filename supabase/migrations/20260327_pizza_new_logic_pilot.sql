-- Pilot artifacts for the pizza min-stock recalculation experiment.
-- Safe-by-design: this migration does NOT modify the existing production views.
-- It only adds:
--   1) an explicit product_id <-> ingredient_id mapping table for pizza SKUs
--   2) a test view with the new 14-day availability-based logic

CREATE TABLE IF NOT EXISTS pizza1.product_leftovers_map (
    product_id bigint PRIMARY KEY,
    ingredient_id bigint NOT NULL UNIQUE,
    product_name text NOT NULL,
    ingredient_name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pizza_product_leftovers_map_active
    ON pizza1.product_leftovers_map (active, product_id, ingredient_id);

WITH seed(product_id, ingredient_id) AS (
    VALUES
        (292, 391),
        (294, 392),
        (295, 397),
        (297, 393),
        (298, 394),
        (300, 396),
        (301, 395),
        (573, 901),
        (658, 1412),
        (659, 1411),
        (660, 1413),
        (879, 1954),
        (1054, 2214),
        (1055, 2215),
        (1098, 2274),
        (1099, 2275)
),
product_names AS (
    SELECT p.id AS product_id, p.name AS product_name
    FROM categories.products p
    JOIN seed s ON s.product_id = p.id
),
ingredient_names AS (
    SELECT DISTINCT ON (ds.ingredient_id)
        ds.ingredient_id,
        ds.ingredient_name
    FROM leftovers.daily_snapshots ds
    JOIN seed s ON s.ingredient_id = ds.ingredient_id
    ORDER BY ds.ingredient_id, ds.snapshot_date DESC
)
INSERT INTO pizza1.product_leftovers_map (product_id, ingredient_id, product_name, ingredient_name, active)
SELECT
    s.product_id,
    s.ingredient_id,
    pn.product_name,
    inames.ingredient_name,
    true
FROM seed s
JOIN product_names pn ON pn.product_id = s.product_id
JOIN ingredient_names inames ON inames.ingredient_id = s.ingredient_id
ON CONFLICT (product_id) DO UPDATE
SET ingredient_id = EXCLUDED.ingredient_id,
    product_name = EXCLUDED.product_name,
    ingredient_name = EXCLUDED.ingredient_name,
    active = EXCLUDED.active,
    updated_at = now();

CREATE OR REPLACE VIEW pizza1.v_pizza_distribution_stats_new_logic_test AS
WITH params AS (
    -- Fixed pilot window for reproducible comparison:
    --   [2026-03-14, 2026-03-28)
    SELECT DATE '2026-03-14' AS start_date,
           DATE '2026-03-28' AS end_date
),
store_map_normalized AS (
    SELECT
        st.storage_id,
        sp.spot_id,
        sp.name AS spot_name,
        st.storage_name
    FROM categories.storages st
    JOIN categories.spots sp
      ON lower(trim(sp.name)) = lower(trim(substring(st.storage_name from '"(.*)"')))
    WHERE st.is_deleted = false
),
active_stores AS (
    SELECT DISTINCT storage_id, spot_id, spot_name, storage_name
    FROM store_map_normalized
),
active_pizzas AS (
    SELECT product_id, ingredient_id, product_name, ingredient_name
    FROM pizza1.product_leftovers_map
    WHERE active = true
),
days AS (
    SELECT generate_series(p.start_date, p.end_date - 1, interval '1 day')::date AS business_date
    FROM params p
),
base AS (
    SELECT
        d.business_date,
        s.storage_id,
        s.spot_id,
        s.spot_name,
        s.storage_name,
        p.product_id,
        p.ingredient_id,
        p.product_name,
        p.ingredient_name
    FROM days d
    CROSS JOIN active_stores s
    CROSS JOIN active_pizzas p
),
sales_daily AS (
    SELECT
        t.date_close::date AS business_date,
        t.spot_id,
        ti.product_id,
        SUM(COALESCE(ti.num, 0))::numeric AS daily_sales
    FROM categories.transactions t
    JOIN categories.transaction_items ti
      ON ti.transaction_id = t.transaction_id
    JOIN active_pizzas p
      ON p.product_id = ti.product_id
    JOIN params par
      ON t.date_close::date >= par.start_date
     AND t.date_close::date < par.end_date
    GROUP BY t.date_close::date, t.spot_id, ti.product_id
),
stock_daily AS (
    SELECT
        ds.snapshot_date::date AS business_date,
        ds.storage_id,
        ds.ingredient_id,
        MAX(COALESCE(ds.storage_ingredient_left, 0))::numeric AS morning_stock
    FROM leftovers.daily_snapshots ds
    JOIN active_pizzas p
      ON p.ingredient_id = ds.ingredient_id
    JOIN params par
      ON ds.snapshot_date::date >= par.start_date
     AND ds.snapshot_date::date < par.end_date
    GROUP BY ds.snapshot_date::date, ds.storage_id, ds.ingredient_id
),
daily_status AS (
    SELECT
        b.business_date,
        b.storage_id,
        b.spot_id,
        b.spot_name,
        b.storage_name,
        b.product_id,
        b.ingredient_id,
        b.product_name,
        b.ingredient_name,
        COALESCE(st.morning_stock, 0)::numeric AS morning_stock,
        COALESCE(sd.daily_sales, 0)::numeric AS daily_sales,
        (COALESCE(st.morning_stock, 0) > 0 OR COALESCE(sd.daily_sales, 0) > 0) AS available_day
    FROM base b
    LEFT JOIN stock_daily st
      ON st.business_date = b.business_date
     AND st.storage_id = b.storage_id
     AND st.ingredient_id = b.ingredient_id
    LEFT JOIN sales_daily sd
      ON sd.business_date = b.business_date
     AND sd.spot_id = b.spot_id
     AND sd.product_id = b.product_id
),
agg AS (
    SELECT
        spot_name,
        storage_name,
        spot_id,
        storage_id,
        product_id,
        ingredient_id,
        product_name,
        ingredient_name,
        COUNT(*)::integer AS total_days_14d,
        COUNT(*) FILTER (WHERE available_day)::integer AS available_days_14d,
        COUNT(*) FILTER (WHERE morning_stock = 0 AND daily_sales > 0)::integer AS zero_morning_but_sold_days_14d,
        SUM(daily_sales)::numeric AS sales_14d
    FROM daily_status
    GROUP BY
        spot_name, storage_name, spot_id, storage_id,
        product_id, ingredient_id, product_name, ingredient_name
)
SELECT
    a.spot_name,
    a.storage_name,
    a.spot_id,
    a.storage_id,
    a.product_id,
    a.ingredient_id,
    a.product_name,
    a.ingredient_name,
    a.total_days_14d,
    a.available_days_14d,
    a.zero_morning_but_sold_days_14d,
    ROUND(a.sales_14d, 3) AS sales_14d,
    CASE
        WHEN a.available_days_14d > 0
            THEN ROUND((a.sales_14d / a.available_days_14d::numeric), 4)
        ELSE NULL
    END AS avg_sales_day_new,
    CASE
        WHEN a.available_days_14d > 0
            THEN CEIL((a.sales_14d / a.available_days_14d::numeric) * 1.5)::integer
        ELSE NULL
    END AS min_stock_new,
    'morning_stock_or_sales'::text AS availability_mode,
    (SELECT start_date FROM params) AS window_start,
    (SELECT end_date FROM params) AS window_end
FROM agg a;

GRANT SELECT ON pizza1.product_leftovers_map TO service_role, authenticated;
GRANT SELECT ON pizza1.v_pizza_distribution_stats_new_logic_test TO service_role, authenticated;
