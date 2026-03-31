-- ============================================================
-- Migration: pizza1 OOS-aware min_stock distribution layer
-- Date: 2026-03-28
-- Author: planned in docs/pizza-distribution-architecture.md §8
--
-- Architecture: Path A (merge-view retains original name).
--   fn_full_recalculate_all / fn_run_pizza_distribution are NOT modified.
--   No store uses new logic until explicitly enabled in flags table.
--
-- Objects created (5 total):
--   1. pizza1.product_leftovers_map        (TABLE, idempotent seed)
--   2. pizza1.pizza_oos_logic_flags        (TABLE, all flags=false)
--   3. pizza1.v_pizza_distribution_stats_legacy  (VIEW, frozen copy of current live SQL)
--   4. pizza1.v_pizza_distribution_stats_oos     (VIEW, new dynamic logic)
--   5. pizza1.v_pizza_distribution_stats         (VIEW, merge-view, same name)
--
-- SAFE TO APPLY: no flags are enabled → all stores keep legacy behaviour.
-- Rollback: see comment at bottom.
-- ============================================================

BEGIN;

-- ─── 1. MAPPING TABLE (product_id ↔ ingredient_id for 16 pizza SKUs) ─────────
-- Idempotent: was created in 20260327_pizza_new_logic_pilot.sql but NOT applied
-- to production DB. Safe to re-run via IF NOT EXISTS + ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS pizza1.product_leftovers_map (
    product_id      bigint      PRIMARY KEY,
    ingredient_id   bigint      NOT NULL UNIQUE,
    product_name    text        NOT NULL,
    ingredient_name text        NOT NULL,
    active          boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pizza_product_leftovers_map_active
    ON pizza1.product_leftovers_map (active, product_id, ingredient_id);

WITH seed(product_id, ingredient_id) AS (
    VALUES
        (292,  391),
        (294,  392),
        (295,  397),
        (297,  393),
        (298,  394),
        (300,  396),
        (301,  395),
        (573,  901),
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
INSERT INTO pizza1.product_leftovers_map
    (product_id, ingredient_id, product_name, ingredient_name, active)
SELECT
    s.product_id,
    s.ingredient_id,
    pn.product_name,
    inames.ingredient_name,
    true
FROM seed s
JOIN product_names     pn     ON pn.product_id     = s.product_id
JOIN ingredient_names  inames ON inames.ingredient_id = s.ingredient_id
ON CONFLICT (product_id) DO NOTHING;

-- ─── 2. FEATURE FLAGS TABLE ───────────────────────────────────────────────────
-- One row per spot_id. Default: use_oos_logic = false (all stores keep legacy).
-- To enable a store:
--   INSERT INTO pizza1.pizza_oos_logic_flags
--       (spot_id, storage_id, use_oos_logic, updated_by, note)
--       VALUES (<spot_id>, <storage_id>, true, 'admin', 'Pilot: Рівненська');
-- To roll back a store:
--   UPDATE pizza1.pizza_oos_logic_flags
--      SET use_oos_logic = false, updated_at = now(), note = 'rollback'
--    WHERE spot_id = <spot_id>;

CREATE TABLE IF NOT EXISTS pizza1.pizza_oos_logic_flags (
    spot_id       bigint      NOT NULL,
    storage_id    bigint,                   -- informational reference, nullable
    use_oos_logic boolean     NOT NULL DEFAULT false,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text,
    note          text,
    CONSTRAINT pizza_oos_logic_flags_pkey PRIMARY KEY (spot_id)
);

COMMENT ON TABLE pizza1.pizza_oos_logic_flags IS
    'Per-store feature flag for OOS-aware min_stock calculation. '
    'use_oos_logic=false → v_pizza_distribution_stats_legacy. '
    'use_oos_logic=true  → v_pizza_distribution_stats_oos.';

-- No rows inserted: all stores start on legacy until explicitly enabled.

-- ─── 3. FREEZE CURRENT LIVE VIEW INTO _LEGACY ────────────────────────────────
-- We do NOT rename the live view. Instead we create a frozen copy from the
-- current live SQL definition and then replace the original name with the
-- merge-view in step 5. This keeps dependencies stable and avoids a temporary
-- missing-view state.

CREATE OR REPLACE VIEW pizza1.v_pizza_distribution_stats_legacy AS
 SELECT vo."код_продукту" AS product_id,
    vo."назва_продукту" AS product_name,
    vo."назва_магазину" AS spot_name,
    vo.avg_sales_day,
    vo.min_stock,
    (COALESCE(max(ves.physical_stock), (0)::numeric))::integer AS stock_now,
    COALESCE(max(prod.baked_at_factory), 0) AS baked_at_factory,
    (GREATEST((0)::numeric, ((vo.min_stock)::numeric - COALESCE(max(ves.physical_stock), (0)::numeric))))::integer AS need_net
   FROM ((pizza1.v_pizza_orders vo
     LEFT JOIN pizza1.v_pizza_production_only prod ON ((vo."код_продукту" = prod.product_id)))
     LEFT JOIN pizza1.v_effective_stocks ves ON (((regexp_replace(replace(lower(COALESCE(ves.storage_name, ''::text)), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) = regexp_replace(replace(lower(vo."назва_магазину"), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)) AND (regexp_replace(lower(TRIM(BOTH FROM ves.ingredient_name)), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) = regexp_replace(lower(TRIM(BOTH FROM vo."назва_продукту")), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)))))
  GROUP BY vo."код_продукту", vo."назва_продукту", vo."назва_магазину", vo.avg_sales_day, vo.min_stock;

-- ─── 4. OOS-AWARE PRODUCTION VIEW (dynamic window + fallback) ─────────────────
-- Exposes diagnostic fields for the merge-view:
--   product_id, product_name, spot_name, spot_id, storage_id,
--   available_days_14d, sales_14d, avg_sales_day, min_stock
--
-- Fallback rule (agreed in architecture review 2026-03-27):
--   available_days_14d >= 7  →  sales_14d / available_days_14d   (OOS-aware)
--   available_days_14d < 7   →  sales_14d / 14.0                 (legacy formula)
--
-- This view does NOT contain stock_now / baked_at_factory.
-- need_net is recalculated in the merge-view from the selected min_stock and
-- legacy stock_now so the final contract stays consistent.
-- The merge-view (step 5) combines both sources.

CREATE OR REPLACE VIEW pizza1.v_pizza_distribution_stats_oos AS
WITH kyiv_today AS (
    SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date AS d
),
params AS (
    SELECT
        (d - INTERVAL '14 days')::date AS start_date,
        d                              AS end_date
    FROM kyiv_today
),
store_map_normalized AS (
    SELECT
        st.storage_id,
        sp.spot_id,
        sp.name            AS spot_name,
        st.storage_name
    FROM categories.storages st
    JOIN categories.spots sp
      ON lower(trim(sp.name)) = lower(trim(substring(st.storage_name FROM '"(.*)"')))
    WHERE st.is_deleted = false
),
active_stores AS (
    SELECT
        chosen.storage_id,
        chosen.spot_id,
        chosen.spot_name,
        chosen.storage_name
    FROM (
        SELECT
            smn.*,
            row_number() OVER (
                PARTITION BY smn.spot_id
                ORDER BY
                    CASE
                        WHEN smn.storage_name ILIKE 'Магазин "%"'
                            THEN 0
                        WHEN smn.storage_name ILIKE 'МАГАЗИН "%"'
                            THEN 0
                        ELSE 1
                    END,
                    smn.storage_id
            ) AS rn
        FROM store_map_normalized smn
    ) chosen
    WHERE chosen.rn = 1
),
active_pizzas AS (
    SELECT product_id, ingredient_id, product_name, ingredient_name
    FROM pizza1.product_leftovers_map
    WHERE active = true
),
days AS (
    SELECT generate_series(p.start_date, p.end_date - 1, INTERVAL '1 day')::date AS business_date
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
        t.date_close::date  AS business_date,
        t.spot_id,
        ti.product_id,
        SUM(COALESCE(ti.num, 0))::numeric AS daily_sales
    FROM categories.transactions t
    JOIN categories.transaction_items ti ON ti.transaction_id = t.transaction_id
    JOIN active_pizzas p   ON p.product_id  = ti.product_id
    JOIN params par
      ON t.date_close::date >= par.start_date
     AND t.date_close::date <  par.end_date
    GROUP BY t.date_close::date, t.spot_id, ti.product_id
),
stock_daily AS (
    SELECT
        ds.snapshot_date::date AS business_date,
        ds.storage_id,
        ds.ingredient_id,
        MAX(COALESCE(ds.storage_ingredient_left, 0))::numeric AS morning_stock
    FROM leftovers.daily_snapshots ds
    JOIN active_pizzas p   ON p.ingredient_id  = ds.ingredient_id
    JOIN params par
      ON ds.snapshot_date::date >= par.start_date
     AND ds.snapshot_date::date <  par.end_date
    GROUP BY ds.snapshot_date::date, ds.storage_id, ds.ingredient_id
),
daily_status AS (
    SELECT
        b.business_date,
        b.storage_id,
        b.spot_id,
        b.spot_name,
        b.product_id,
        b.product_name,
        COALESCE(st.morning_stock, 0)::numeric AS morning_stock,
        COALESCE(sd.daily_sales,   0)::numeric AS daily_sales,
        (
            COALESCE(st.morning_stock, 0) > 0
            OR COALESCE(sd.daily_sales,  0) > 0
        ) AS available_day
    FROM base b
    LEFT JOIN stock_daily st
      ON  st.business_date = b.business_date
      AND st.storage_id    = b.storage_id
      AND st.ingredient_id = b.ingredient_id
    LEFT JOIN sales_daily sd
      ON  sd.business_date = b.business_date
      AND sd.spot_id       = b.spot_id
      AND sd.product_id    = b.product_id
),
agg AS (
    SELECT
        spot_name,
        spot_id,
        storage_id,
        product_id,
        product_name,
        COUNT(*)::integer                             AS total_days_14d,
        COUNT(*) FILTER (WHERE available_day)::integer AS available_days_14d,
        SUM(daily_sales)::numeric                     AS sales_14d
    FROM daily_status
    GROUP BY spot_name, spot_id, storage_id, product_id, product_name
)
SELECT
    a.product_id,
    a.product_name,
    a.spot_name,
    a.spot_id,
    a.storage_id,
    a.available_days_14d,
    ROUND(a.sales_14d, 3)                                    AS sales_14d,
    -- avg_sales_day: fallback if available_days_14d < 7
    CASE
        WHEN a.available_days_14d >= 7
            THEN ROUND(a.sales_14d / a.available_days_14d::numeric, 4)
        ELSE
            ROUND(a.sales_14d / 14.0, 4)
    END                                                      AS avg_sales_day,
    -- min_stock = ceil(avg * 1.5), same fallback applies
    CASE
        WHEN a.available_days_14d >= 7
            THEN CEIL((a.sales_14d / a.available_days_14d::numeric) * 1.5)::integer
        ELSE
            CEIL((a.sales_14d / 14.0) * 1.5)::integer
    END                                                      AS min_stock
FROM agg a;

COMMENT ON VIEW pizza1.v_pizza_distribution_stats_oos IS
    'OOS-aware avg_sales_day and min_stock. Dynamic 14-day window ending kyiv_today. '
    'Fallback: available_days_14d < 7 → divides by 14 (legacy denominator). '
    'stock_now and baked_at_factory stay in the legacy view; need_net is recalculated in the merge-view.';

-- ─── 5. MERGE-VIEW (retains original name — fn_run_pizza_distribution unchanged) ─
-- Live contract from the database:
--   product_id bigint
--   product_name text
--   spot_name text
--   avg_sales_day numeric
--   min_stock integer
--   stock_now integer
--   baked_at_factory integer
--   need_net integer
--
-- Logic:
--   spot flagged (use_oos_logic=true) AND OOS values present  → avg/min from OOS
--   otherwise                                                 → avg/min from legacy
--   stock_now, baked_at_factory                              → always from legacy
--   need_net                                                 → always recalculated from selected min_stock and legacy stock_now

CREATE OR REPLACE VIEW pizza1.v_pizza_distribution_stats AS
WITH merged AS (
    SELECT
        l.product_id,
        l.product_name,
        l.spot_name,
        CASE
            WHEN f.use_oos_logic = true AND o.avg_sales_day IS NOT NULL
                THEN o.avg_sales_day
            ELSE l.avg_sales_day
        END AS avg_sales_day,
        CASE
            WHEN f.use_oos_logic = true AND o.min_stock IS NOT NULL
                THEN o.min_stock
            ELSE l.min_stock
        END AS min_stock,
        l.stock_now,
        l.baked_at_factory
    FROM pizza1.v_pizza_distribution_stats_legacy l
    LEFT JOIN pizza1.v_pizza_distribution_stats_oos o
        ON  o.product_id = l.product_id
        AND o.spot_name  = l.spot_name
    LEFT JOIN pizza1.pizza_oos_logic_flags f
        ON  f.spot_id = o.spot_id
)
SELECT
    m.product_id,
    m.product_name,
    m.spot_name,
    m.avg_sales_day,
    m.min_stock,
    m.stock_now,
    m.baked_at_factory,
    GREATEST(0, m.min_stock - COALESCE(m.stock_now, 0))::integer AS need_net
FROM merged m;

COMMENT ON VIEW pizza1.v_pizza_distribution_stats IS
    'Merge-view: routes each spot to legacy or OOS source based on pizza_oos_logic_flags. '
    'Same column signature as original → fn_run_pizza_distribution unchanged.';

-- ─── GRANTS ───────────────────────────────────────────────────────────────────
GRANT SELECT ON pizza1.pizza_oos_logic_flags              TO service_role, authenticated;
GRANT SELECT ON pizza1.v_pizza_distribution_stats_legacy  TO service_role, authenticated;
GRANT SELECT ON pizza1.v_pizza_distribution_stats_oos     TO service_role, authenticated;
-- v_pizza_distribution_stats grant inherited from original; re-apply for safety:
GRANT SELECT ON pizza1.v_pizza_distribution_stats         TO service_role, authenticated;

COMMIT;

-- ─── ROLLBACK PROCEDURE (if needed) ──────────────────────────────────────────
-- 1. DROP VIEW pizza1.v_pizza_distribution_stats;
-- 2. CREATE OR REPLACE VIEW pizza1.v_pizza_distribution_stats AS
--        <definition from pizza1.v_pizza_distribution_stats_legacy>;
-- 3. DROP VIEW IF EXISTS pizza1.v_pizza_distribution_stats_oos;
-- 4. DROP VIEW IF EXISTS pizza1.v_pizza_distribution_stats_legacy;
-- 5. DROP TABLE IF EXISTS pizza1.pizza_oos_logic_flags;
-- product_leftovers_map: keep (harmless, used for diagnostics)
