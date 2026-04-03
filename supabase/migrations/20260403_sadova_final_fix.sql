-- ==============================================================
-- САДОВА: Полная миграция в изолированную схему sadova1
-- ВСЕ вью и функции находятся СТРОГО в sadova1
-- ==============================================================

-- 0. Очистка public и sadova1 от старых версий (чтобы не путать)
DROP VIEW IF EXISTS public.v_sadova_results_public CASCADE;
DROP VIEW IF EXISTS public.v_sadova_production_tasks CASCADE;
DROP VIEW IF EXISTS public.v_sadova_plan_d1 CASCADE;
DROP VIEW IF EXISTS public.v_sadova_plan_d1_detailed CASCADE;
DROP VIEW IF EXISTS public.v_sadova_plan_d2 CASCADE;
DROP VIEW IF EXISTS public.v_sadova_critical_d2 CASCADE;
DROP VIEW IF EXISTS public.v_sadova_critical_d3 CASCADE;
DROP VIEW IF EXISTS public.v_sadova_dashboard_metrics CASCADE;

-- Очистка старых названий внутри sadova1 (с префиксом _sadova_)
DROP VIEW IF EXISTS sadova1.v_sadova_distribution_stats CASCADE;
DROP VIEW IF EXISTS sadova1.v_sadova_stats CASCADE;
DROP VIEW IF EXISTS sadova1.v_sadova_stats_with_effective_stock CASCADE;
DROP VIEW IF EXISTS sadova1.v_sadova_today_distribution CASCADE;
DROP VIEW IF EXISTS sadova1.v_sadova_production_tasks_test CASCADE;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 1: Базовые ТАБЛИЦЫ (в схеме sadova1)
-- ──────────────────────────────────────────────────────────────

-- Таблица для долгов по доставке (delivery_debt)
CREATE TABLE IF NOT EXISTS sadova1.delivery_debt (
    spot_id      integer      NOT NULL,
    product_id   integer      NOT NULL,
    product_name text,
    spot_name    text,
    debt_kg      numeric(10,2) NOT NULL DEFAULT 0,
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT delivery_debt_pkey PRIMARY KEY (spot_id, product_id),
    CONSTRAINT delivery_debt_debt_kg_nonneg CHECK (debt_kg >= 0)
);

-- Таблица для ежедневного производства (кеш данных Poster)
CREATE TABLE IF NOT EXISTS sadova1.production_daily (
    business_date           DATE          NOT NULL,
    storage_id              INT           NOT NULL DEFAULT 34, -- Склад Садовы
    product_name_normalized TEXT          NOT NULL,
    product_name            TEXT          NOT NULL,
    quantity_kg             NUMERIC(10,3) NOT NULL DEFAULT 0,
    synced_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (business_date, storage_id, product_name_normalized)
);

-- ──────────────────────────────────────────────────────────────
-- ШАГ 2: Базовые VIEW (в схеме sadova1)
-- ──────────────────────────────────────────────────────────────

-- 1. Эффективные остатки
CREATE OR REPLACE VIEW sadova1.v_effective_stocks AS
WITH latest_stocks AS (
    SELECT DISTINCT ON (s.storage_id, s.product_id)
        s.storage_id,
        s.product_id       AS ingredient_id,
        s.product_name     AS ingredient_name,
        s.stock_left       AS storage_ingredient_left,
        s.unit             AS ingredient_unit
    FROM sadova1.distribution_input_stocks s
    WHERE s.business_date = CURRENT_DATE
    ORDER BY s.storage_id, s.product_id, s.created_at DESC
),
pending_deliveries AS (
    SELECT 
        dr.spot_id, 
        dr.product_id, 
        sum(dr.quantity_to_ship) AS pending_qty
    FROM sadova1.distribution_results dr
    WHERE dr.delivery_status = 'pending' AND dr.business_date = CURRENT_DATE
    GROUP BY dr.spot_id, dr.product_id
)
SELECT
    s.storage_id,
    st.storage_name,
    s.ingredient_id,
    s.ingredient_name,
    s.storage_ingredient_left AS physical_stock,
    COALESCE(p.pending_qty, 0::bigint) AS virtual_stock,
    (s.storage_ingredient_left + COALESCE(p.pending_qty, 0::bigint)::numeric) AS effective_stock,
    s.ingredient_unit
FROM latest_stocks s
JOIN categories.storages st ON st.storage_id = s.storage_id
LEFT JOIN sadova1.distribution_shops ds ON ds.storage_id = s.storage_id
LEFT JOIN pending_deliveries p ON p.spot_id = ds.spot_id AND p.product_id = s.ingredient_id
WHERE s.ingredient_id IN (
    SELECT product_id FROM sadova1.production_catalog WHERE is_active = true
);

-- 2. Статистика магазинов
CREATE OR REPLACE VIEW sadova1.v_stats AS
SELECT 
    db.product_id,
    db.product_name,
    pc.category_name,
    ds.storage_id,
    db.spot_name,
    db.current_stock AS stock_now,
    db.avg_sales_day,
    db.min_stock,
    GREATEST(0::numeric, db.min_stock - db.current_stock) AS deficit
FROM sadova1.distribution_base db
JOIN sadova1.production_catalog pc ON pc.product_id = db.product_id
JOIN sadova1.distribution_shops ds ON ds.spot_id = db.spot_id
WHERE pc.is_active = true
  AND ds.is_active = true;

-- 3. Утренние остатки
CREATE OR REPLACE VIEW sadova1.v_morning_leftovers AS
SELECT s.business_date AS snapshot_date,
    s.storage_id,
    s.product_id         AS ingredient_id,
    s.product_name       AS ingredient_name,
    s.stock_left         AS ingredient_left,
    s.stock_left         AS storage_ingredient_left,
    NULL::numeric        AS limit_value,
    s.unit               AS ingredient_unit,
    NULL::text           AS ingredients_type,
    NULL::numeric        AS storage_ingredient_sum,
    NULL::numeric        AS storage_ingredient_sum_netto,
    NULL::numeric        AS prime_cost,
    NULL::numeric        AS prime_cost_netto,
    false                AS hidden,
    s.created_at         AS loaded_at,
    NULL::jsonb          AS api_response_raw
FROM sadova1.distribution_input_stocks s
JOIN sadova1.distribution_shops ds ON ds.storage_id = s.storage_id
WHERE ds.is_active = true
  AND s.business_date = (SELECT MAX(business_date) FROM sadova1.distribution_input_stocks);

-- 4. Текущее производство
CREATE OR REPLACE VIEW sadova1.v_production_logic AS
SELECT
    p.product_id,
    max(p.product_name) AS product_name,
    round(sum(p.quantity))::integer AS baked_qty
FROM sadova1.distribution_input_production p
WHERE p.business_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kiev')::date
  AND p.storage_id = 34 -- Hub storage Sadova
GROUP BY p.product_id;

-- 5. Задачи производства
CREATE OR REPLACE VIEW sadova1.v_production_tasks AS
SELECT dr.product_id,
    dr.product_name,
    dr.business_date,
    pc.category_id,
    pc.category_name,
    sum(dr.quantity_to_ship) AS total_demand_kg,
    pc.portion_size AS portion_weight_kg,
    pc.unit,
    ceil(((sum(dr.quantity_to_ship))::numeric / pc.portion_size)) AS portions_needed,
    (ceil(((sum(dr.quantity_to_ship))::numeric / pc.portion_size)) * pc.portion_size) AS actual_production_kg,
    pc.is_active AS in_production_catalog
FROM sadova1.distribution_results dr
LEFT JOIN sadova1.production_catalog pc ON dr.product_id = pc.product_id
WHERE dr.business_date = CURRENT_DATE
GROUP BY dr.product_id, dr.product_name, dr.business_date, pc.category_id, pc.category_name, pc.portion_size, pc.unit, pc.is_active;

-- 6. Расширенная статистика
CREATE OR REPLACE VIEW sadova1.v_stats_with_effective_stock AS
SELECT gs.product_id,
    gs.product_name,
    gs.category_name,
    gs.storage_id,
    gs.spot_name,
    gs.stock_now,
    gs.avg_sales_day,
    gs.min_stock,
    gs.deficit,
    COALESCE(ve.physical_stock, gs.stock_now) AS physical_stock,
    COALESCE(ve.virtual_stock, (0)::bigint) AS virtual_stock,
    COALESCE(ve.effective_stock, gs.stock_now) AS effective_stock
FROM sadova1.v_stats gs
LEFT JOIN sadova1.v_effective_stocks ve ON ve.ingredient_id = gs.product_id AND ve.storage_id = gs.storage_id;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 3: Функции (D1, D2, D3)
-- ──────────────────────────────────────────────────────────────

-- f_plan_production_1day
CREATE OR REPLACE FUNCTION sadova1.f_plan_production_1day()
 RETURNS TABLE(rank integer, product_id integer, product_name text, category_name text, daily_avg numeric, effective_stock_d0 numeric, deficit_d0 numeric, raw_need numeric, portion_size numeric, base_qty numeric, final_qty numeric, risk_index numeric, zero_shops integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_capacity CONSTANT NUMERIC := 495;
    v_running_total NUMERIC := 0;
    v_rec RECORD;
    v_remainder NUMERIC;
    v_top_product_id INT;
    v_top_portion_size NUMERIC;
BEGIN
    DROP TABLE IF EXISTS temp_sadova_order;
    CREATE TEMP TABLE temp_sadova_order AS
    WITH base_stats AS (
        SELECT
            gs.product_id, gs.product_name, gs.category_name,
            SUM(gs.effective_stock) as total_stock,
            SUM(gs.avg_sales_day) as daily_avg,
            SUM(gs.min_stock) as norm_network,
            SUM(GREATEST(0, gs.min_stock - gs.effective_stock)) as deficit,
            COUNT(*) FILTER (WHERE gs.effective_stock <= 0) as zeros
        FROM sadova1.v_stats_with_effective_stock gs
        GROUP BY gs.product_id, gs.product_name, gs.category_name
        HAVING SUM(GREATEST(0, gs.min_stock - gs.effective_stock)) > 0
    ),
    needs AS (
        SELECT
            bs.*,
            bs.deficit + bs.daily_avg as raw_need,
            ROUND(bs.daily_avg * (bs.deficit::numeric / NULLIF(bs.norm_network, 0)) * 100, 0) as risk_idx,
            pc.portion_size,
            CEIL((bs.deficit + bs.daily_avg) / pc.portion_size) * pc.portion_size as base_qty
        FROM base_stats bs
        JOIN sadova1.production_catalog pc ON pc.product_id = bs.product_id
    ),
    ranked AS (
        SELECT ROW_NUMBER() OVER (ORDER BY n.risk_idx DESC, n.product_name)::INT as rnk, n.* FROM needs n
    )
    SELECT r.rnk, r.product_id, r.product_name, r.category_name, r.daily_avg, r.total_stock, r.deficit, r.raw_need, r.portion_size, r.base_qty, 0::NUMERIC as final_qty, r.risk_idx, r.zeros FROM ranked r;

    FOR v_rec IN SELECT * FROM temp_sadova_order ORDER BY rnk LOOP
        IF v_running_total + v_rec.base_qty <= v_capacity THEN
            UPDATE temp_sadova_order SET final_qty = v_rec.base_qty WHERE product_id = v_rec.product_id;
            v_running_total := v_running_total + v_rec.base_qty;
        ELSE EXIT; END IF;
    END LOOP;

    v_remainder := v_capacity - v_running_total;
    IF v_remainder > 0 THEN
        SELECT product_id, portion_size INTO v_top_product_id, v_top_portion_size FROM temp_sadova_order WHERE final_qty > 0 ORDER BY rnk LIMIT 1;
        IF v_top_product_id IS NOT NULL AND v_remainder >= v_top_portion_size THEN
            UPDATE temp_sadova_order SET final_qty = final_qty + (FLOOR(v_remainder / v_top_portion_size) * v_top_portion_size) WHERE product_id = v_top_product_id;
        END IF;
    END IF;

    RETURN QUERY SELECT t.rnk, t.product_id, t.product_name, t.category_name, t.daily_avg, t.total_stock, t.deficit, t.raw_need, t.portion_size, t.base_qty, t.final_qty, t.risk_idx, t.zeros FROM temp_sadova_order t WHERE t.final_qty > 0 ORDER BY t.rnk;
END;
$function$;

-- f_calculate_evening_d2
CREATE OR REPLACE FUNCTION sadova1.f_calculate_evening_d2()
 RETURNS TABLE(out_product_id integer, out_product_name text, out_spot_name text, out_stock_d0 numeric, out_stock_d1_evening numeric, out_allocated_qty numeric, out_stock_d2_morning numeric, out_stock_d2_evening numeric, out_avg_sales_day numeric, out_min_stock numeric, out_deficit_d2 numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order_rec RECORD;
    v_pool NUMERIC;
    v_zeros_count INT;
    v_total_need NUMERIC;
    v_remainder NUMERIC;
    v_multiplier INT;
    v_k NUMERIC;
BEGIN
    DROP TABLE IF EXISTS temp_order_d1;
    DROP TABLE IF EXISTS temp_evening_d1;
    CREATE TEMP TABLE temp_order_d1 AS SELECT product_id, product_name, final_qty FROM sadova1.f_plan_production_1day() WHERE final_qty > 0;
    CREATE TEMP TABLE temp_evening_d1 AS SELECT product_id::int, product_name, spot_name, FLOOR(effective_stock + 0.3)::numeric as d0_stock, GREATEST(0, FLOOR(effective_stock - avg_sales_day + 0.3))::numeric as d1_eve_stock, avg_sales_day::numeric as sales_avg, min_stock::numeric as norm_stock, 0::numeric as alloc_qty FROM sadova1.v_stats_with_effective_stock;

    FOR v_order_rec IN SELECT * FROM temp_order_d1 LOOP
        v_pool := v_order_rec.final_qty;
        DROP TABLE IF EXISTS temp_calc;
        CREATE TEMP TABLE temp_calc AS SELECT spot_name, sales_avg, norm_stock, d1_eve_stock as eff_stock, 0::numeric as fin_qty, 0::numeric as tmp_need FROM temp_evening_d1 WHERE product_id = v_order_rec.product_id;
        SELECT COUNT(*) INTO v_zeros_count FROM temp_calc WHERE eff_stock <= 0;
        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc SET fin_qty = 1 WHERE spot_name IN (SELECT spot_name FROM temp_calc WHERE eff_stock <= 0 ORDER BY sales_avg DESC, spot_name ASC LIMIT v_pool::int);
            v_pool := 0;
        ELSE UPDATE temp_calc SET fin_qty = 1 WHERE eff_stock <= 0; v_pool := v_pool - v_zeros_count; END IF;
        IF v_pool > 0 THEN
            UPDATE temp_calc SET tmp_need = GREATEST(0, norm_stock - (eff_stock + fin_qty));
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc;
            IF v_total_need > 0 THEN
                IF v_pool < v_total_need THEN
                    v_k := v_pool / v_total_need;
                    UPDATE temp_calc SET fin_qty = fin_qty + FLOOR(tmp_need * v_k);
                    v_remainder := v_pool - (SELECT SUM(FLOOR(tmp_need * v_k)) FROM temp_calc);
                    IF v_remainder > 0 THEN UPDATE temp_calc SET fin_qty = fin_qty + 1 WHERE spot_name IN (SELECT spot_name FROM temp_calc WHERE tmp_need > 0 ORDER BY sales_avg DESC LIMIT v_remainder::int); END IF;
                    v_pool := 0;
                ELSE UPDATE temp_calc SET fin_qty = fin_qty + tmp_need; v_pool := v_pool - v_total_need; END IF;
            END IF;
        END IF;
        v_multiplier := 2;
        WHILE v_pool > 0 AND v_multiplier < 15 LOOP
            UPDATE temp_calc SET tmp_need = GREATEST(0, (norm_stock * v_multiplier) - (eff_stock + fin_qty));
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc;
            EXIT WHEN v_total_need = 0;
            IF v_pool < v_total_need THEN
                v_k := v_pool / v_total_need; UPDATE temp_calc SET fin_qty = fin_qty + FLOOR(tmp_need * v_k);
                v_remainder := v_pool - (SELECT SUM(FLOOR(tmp_need * v_k)) FROM temp_calc);
                IF v_remainder > 0 THEN UPDATE temp_calc SET fin_qty = fin_qty + 1 WHERE spot_name IN (SELECT spot_name FROM temp_calc WHERE tmp_need > 0 ORDER BY sales_avg DESC LIMIT v_remainder::int); END IF;
                v_pool := 0;
            ELSE UPDATE temp_calc SET fin_qty = fin_qty + tmp_need; v_pool := v_pool - v_total_need; v_multiplier := v_multiplier + 1; END IF;
        END LOOP;
        UPDATE temp_evening_d1 e SET alloc_qty = c.fin_qty FROM temp_calc c WHERE e.product_id = v_order_rec.product_id AND e.spot_name = c.spot_name;
        DROP TABLE temp_calc;
    END LOOP;
    RETURN QUERY SELECT e.product_id, e.product_name, e.spot_name, e.d0_stock, e.d1_eve_stock, e.alloc_qty, (e.d1_eve_stock + e.alloc_qty), GREATEST(0, FLOOR((e.d1_eve_stock + e.alloc_qty) - e.sales_avg + 0.3)), e.sales_avg, e.norm_stock, GREATEST(0, e.norm_stock - GREATEST(0, FLOOR((e.d1_eve_stock + e.alloc_qty) - e.sales_avg + 0.3))) FROM temp_evening_d1 e;
END;
$function$;

-- f_calculate_evening_d3
CREATE OR REPLACE FUNCTION sadova1.f_calculate_evening_d3()
 RETURNS TABLE(result_product_id integer, result_product_name text, result_spot_name text, result_stock_d2_evening numeric, result_allocated_qty numeric, result_stock_d3_morning numeric, result_stock_d3_evening numeric, result_avg_sales_day numeric, result_min_stock numeric, result_deficit_d3 numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_capacity CONSTANT NUMERIC := 495;
    v_running_total NUMERIC := 0;
    v_order_rec RECORD;
    v_pool NUMERIC;
    v_zeros_count INT;
    v_total_need NUMERIC;
    v_remainder NUMERIC;
    v_multiplier INT;
    v_k NUMERIC;
BEGIN
    DROP TABLE IF EXISTS temp_evening_d2_g3;
    CREATE TEMP TABLE temp_evening_d2_g3 AS SELECT out_product_id::int as product_id, out_product_name as product_name, out_spot_name as spot_name, out_stock_d2_evening as d2_eve_stock, out_avg_sales_day as sales_avg, out_min_stock as norm_stock, 0::numeric as alloc_qty FROM sadova1.f_calculate_evening_d2();
    DROP TABLE IF EXISTS temp_order_d2_g3;
    CREATE TEMP TABLE temp_order_d2_g3 AS WITH d2_stats AS (SELECT product_id, product_name, SUM(GREATEST(0, norm_stock - d2_eve_stock)) as deficit, SUM(sales_avg) as daily_avg, SUM(norm_stock) as norm_network FROM temp_evening_d2_g3 GROUP BY product_id, product_name HAVING SUM(GREATEST(0, norm_stock - d2_eve_stock)) > 0)
    SELECT s.product_id, s.product_name, ROUND(s.daily_avg * (s.deficit / NULLIF(s.norm_network, 0)) * 100, 0) as risk_idx, pc.portion_size, CEIL((s.deficit + s.daily_avg) / pc.portion_size) * pc.portion_size as base_qty, 0::numeric as final_qty FROM d2_stats s JOIN sadova1.production_catalog pc ON pc.product_id = s.product_id;

    FOR v_order_rec IN SELECT * FROM temp_order_d2_g3 ORDER BY risk_idx DESC LOOP
        IF v_running_total + v_order_rec.base_qty <= v_capacity THEN UPDATE temp_order_d2_g3 SET final_qty = v_order_rec.base_qty WHERE product_id = v_order_rec.product_id; v_running_total := v_running_total + v_order_rec.base_qty;
        ELSE EXIT; END IF;
    END LOOP;

    FOR v_order_rec IN SELECT * FROM temp_order_d2_g3 WHERE final_qty > 0 LOOP
        v_pool := v_order_rec.final_qty;
        DROP TABLE IF EXISTS temp_calc_g3;
        CREATE TEMP TABLE temp_calc_g3 AS SELECT spot_name, sales_avg, norm_stock, d2_eve_stock as eff_stock, 0::numeric as fin_qty, 0::numeric as tmp_need FROM temp_evening_d2_g3 WHERE product_id = v_order_rec.product_id;
        SELECT COUNT(*) INTO v_zeros_count FROM temp_calc_g3 WHERE eff_stock <= 0;
        IF v_zeros_count > 0 THEN
            IF v_pool <= v_zeros_count THEN UPDATE temp_calc_g3 SET fin_qty = 1 WHERE spot_name IN (SELECT spot_name FROM temp_calc_g3 WHERE eff_stock <= 0 ORDER BY sales_avg DESC LIMIT v_pool::int); v_pool := 0;
            ELSE UPDATE temp_calc_g3 SET fin_qty = 1 WHERE eff_stock <= 0; v_pool := v_pool - v_zeros_count; END IF;
        END IF;
        IF v_pool > 0 THEN
            UPDATE temp_calc_g3 SET tmp_need = GREATEST(0, norm_stock - (eff_stock + fin_qty));
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc_g3;
            IF v_total_need > 0 THEN
                IF v_pool < v_total_need THEN
                    v_k := v_pool / v_total_need; UPDATE temp_calc_g3 SET fin_qty = fin_qty + FLOOR(tmp_need * v_k);
                    v_remainder := v_pool - (SELECT SUM(FLOOR(tmp_need * v_k)) FROM temp_calc_g3);
                    IF v_remainder > 0 THEN UPDATE temp_calc_g3 SET fin_qty = fin_qty + 1 WHERE spot_name IN (SELECT spot_name FROM temp_calc_g3 WHERE tmp_need > 0 ORDER BY sales_avg DESC LIMIT v_remainder::int); END IF;
                    v_pool := 0;
                ELSE UPDATE temp_calc_g3 SET fin_qty = fin_qty + tmp_need; v_pool := v_pool - v_total_need; END IF;
            END IF;
        END IF;
        v_multiplier := 2;
        WHILE v_pool > 0 AND v_multiplier < 15 LOOP
            UPDATE temp_calc_g3 SET tmp_need = GREATEST(0, (norm_stock * v_multiplier) - (eff_stock + fin_qty));
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc_g3; EXIT WHEN v_total_need = 0;
            IF v_pool < v_total_need THEN
                v_k := v_pool / v_total_need; UPDATE temp_calc_g3 SET fin_qty = fin_qty + FLOOR(tmp_need * v_k);
                v_remainder := v_pool - (SELECT SUM(FLOOR(tmp_need * v_k)) FROM temp_calc_g3);
                IF v_remainder > 0 THEN UPDATE temp_calc_g3 SET fin_qty = fin_qty + 1 WHERE spot_name IN (SELECT spot_name FROM temp_calc_g3 WHERE tmp_need > 0 ORDER BY sales_avg DESC LIMIT v_remainder::int); END IF;
                v_pool := 0;
            ELSE UPDATE temp_calc_g3 SET fin_qty = fin_qty + tmp_need; v_pool := v_pool - v_total_need; v_multiplier := v_multiplier + 1; END IF;
        END LOOP;
        UPDATE temp_evening_d2_g3 e SET alloc_qty = c.fin_qty FROM temp_calc_g3 c WHERE e.product_id = v_order_rec.product_id AND e.spot_name = c.spot_name;
    END LOOP;
    RETURN QUERY SELECT e.product_id, e.product_name, e.spot_name, e.d2_eve_stock, e.alloc_qty, (e.d2_eve_stock + e.alloc_qty), GREATEST(0, FLOOR((e.d2_eve_stock + e.alloc_qty) - e.sales_avg + 0.3)), e.sales_avg, e.norm_stock, GREATEST(0, e.norm_stock - GREATEST(0, FLOOR((e.d2_eve_stock + e.alloc_qty) - e.sales_avg + 0.3))) FROM temp_evening_d2_g3 e;
END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 4: Финальные VIEW (СТРОГО в sadova1)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW sadova1.v_results_public AS
SELECT id, product_name AS "Название продукта", spot_name AS "Магазин", quantity_to_ship AS "Количество", created_at AS "Время расчета"
FROM sadova1.distribution_results WHERE (created_at)::date = CURRENT_DATE;

CREATE OR REPLACE VIEW sadova1.v_plan_d1 AS
SELECT * FROM sadova1.f_plan_production_1day();

CREATE OR REPLACE VIEW sadova1.v_plan_d1_detailed AS
SELECT 
    product_id AS "код_продукту",
    product_name, 
    category_name, 
    spot_name AS store_name, 
    effective_stock AS current_stock, 
    min_stock, 
    avg_sales_day, 
    deficit AS deficit_kg, 
    avg_sales_day AS recommended_kg,
    CASE 
        WHEN effective_stock <= 0 THEN 1 
        WHEN effective_stock < min_stock THEN 2 
        ELSE 3 
    END AS priority_number,
    (deficit / NULLIF(min_stock, 0) * 100) AS deficit_percent
FROM sadova1.v_stats_with_effective_stock 
WHERE effective_stock < min_stock 
ORDER BY priority_number, product_name, spot_name;

CREATE OR REPLACE VIEW sadova1.v_plan_d2 AS
SELECT out_product_name AS product_name, sum(out_allocated_qty) AS allocated_d2, row_number() OVER (ORDER BY sum(out_allocated_qty) DESC) AS rank
FROM sadova1.f_calculate_evening_d2() GROUP BY out_product_name HAVING sum(out_allocated_qty) > 0;

CREATE OR REPLACE VIEW sadova1.v_critical_d2 AS
SELECT out_product_name AS product_name, count(*) FILTER (WHERE out_stock_d2_evening <= 0) AS zeros_d2, sum(out_deficit_d2) AS deficit_d2, sum(out_stock_d2_evening) AS total_stock_d2
FROM sadova1.f_calculate_evening_d2() GROUP BY out_product_name HAVING count(*) FILTER (WHERE out_stock_d2_evening <= 0) > 0 OR sum(out_deficit_d2) > 0;

CREATE OR REPLACE VIEW sadova1.v_critical_d3 AS
SELECT result_product_name AS product_name, count(*) FILTER (WHERE result_stock_d3_evening <= 0) AS zeros_d3, sum(result_deficit_d3) AS deficit_d3, sum(result_stock_d3_evening) AS total_stock_d3
FROM sadova1.f_calculate_evening_d3() GROUP BY result_product_name HAVING count(*) FILTER (WHERE result_stock_d3_evening <= 0) > 0 OR sum(result_deficit_d3) > 0;

-- Метрики Садовы (в sadova1)
-- Считаем именно ДЕФИЦИТ (сколько нужно приготовить), а не остаток
CREATE OR REPLACE VIEW sadova1.dashboard_metrics AS
SELECT 
    COALESCE(SUM(deficit), 0) AS total_kg,
    COUNT(*) AS total_sku_count,
    COUNT(*) FILTER (WHERE effective_stock <= 0) AS critical_sku_count,
    COUNT(*) FILTER (WHERE effective_stock > 0 AND effective_stock < min_stock) AS high_sku_count,
    COUNT(*) FILTER (WHERE effective_stock >= min_stock) AS reserve_sku_count,
    -- Веса дефицита по приоритетам
    COALESCE(SUM(deficit) FILTER (WHERE effective_stock <= 0), 0) AS critical_kg,
    COALESCE(SUM(deficit) FILTER (WHERE effective_stock > 0 AND effective_stock < min_stock), 0) AS high_kg,
    COALESCE(SUM(deficit) FILTER (WHERE effective_stock >= min_stock), 0) AS reserve_kg
FROM sadova1.v_stats_with_effective_stock;

-- Текущее производство сегодня (в sadova1)
CREATE OR REPLACE VIEW sadova1.production_today AS
SELECT 
    product_id AS "код_продукту",
    product_name AS "назва_продукту",
    sum(quantity) AS "вироблено_кількість",
    count(DISTINCT id) AS "кількість_виробництв",
    min(created_at) AS "перше_виробництво",
    max(created_at) AS "останнє_виробництво"
FROM sadova1.distribution_input_production
WHERE storage_id = 34 
  AND business_date = (
    SELECT max(business_date) 
    FROM sadova1.distribution_input_production 
    WHERE storage_id = 34
  )
GROUP BY product_id, product_name;

-- Дневное производство (вью для обратной совместимости)
CREATE OR REPLACE VIEW sadova1.v_production_daily AS
SELECT 
    storage_id,
    product_id,
    product_name,
    product_name AS product_name_normalized,
    quantity AS quantity_kg,
    business_date,
    created_at AS synced_at
FROM sadova1.distribution_input_production;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 5: Функции подтверждения доставки
-- ──────────────────────────────────────────────────────────────

-- Функция подтверждения доставки (как в Гравитоне)
CREATE OR REPLACE FUNCTION sadova1.fn_confirm_delivery(
    p_business_date      date,
    p_delivered_spot_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '60s'
AS $$
DECLARE
    v_debt_rows      integer := 0;
    v_delivered_rows integer := 0;
BEGIN
    IF p_delivered_spot_ids IS NULL THEN p_delivered_spot_ids := ARRAY[]::integer[]; END IF;

    -- Накапливаем долг
    INSERT INTO sadova1.delivery_debt (spot_id, product_id, product_name, spot_name, debt_kg, updated_at)
    SELECT
        dr.spot_id, dr.product_id, dr.product_name, dr.spot_name, SUM(dr.quantity_to_ship)::numeric AS debt_kg, now()
    FROM sadova1.distribution_results dr
    WHERE dr.business_date = p_business_date
      AND dr.delivery_status = 'pending'
      AND dr.product_id IS NOT NULL
      AND dr.spot_name != 'Остаток на Складе'
      AND dr.spot_id != ALL(p_delivered_spot_ids)
    GROUP BY dr.spot_id, dr.product_id, dr.product_name, dr.spot_name
    ON CONFLICT (spot_id, product_id) DO UPDATE
        SET debt_kg = sadova1.delivery_debt.debt_kg + EXCLUDED.debt_kg, updated_at = now();

    GET DIAGNOSTICS v_debt_rows = ROW_COUNT;

    -- Очищаем долг доставленным магазинам
    UPDATE sadova1.delivery_debt SET debt_kg = 0, updated_at = now()
    WHERE spot_id = ANY(p_delivered_spot_ids) AND debt_kg > 0;

    -- Отмечаем доставленные
    UPDATE sadova1.distribution_results SET delivery_status = 'delivered'
    WHERE business_date = p_business_date AND delivery_status = 'pending' AND spot_id = ANY(p_delivered_spot_ids);
    GET DIAGNOSTICS v_delivered_rows = ROW_COUNT;

    -- Отмечаем пропущенные
    UPDATE sadova1.distribution_results SET delivery_status = 'skipped'
    WHERE business_date = p_business_date AND delivery_status = 'pending' AND spot_name != 'Остаток на Складе';

    RETURN jsonb_build_object('delivered_spots', array_length(p_delivered_spot_ids, 1), 'delivered_rows', v_delivered_rows, 'debt_rows_added', v_debt_rows);
END;
$$;

-- Функция очистки всех долгов
CREATE OR REPLACE FUNCTION sadova1.fn_clear_all_debts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM sadova1.delivery_debt WHERE true; END; $$;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 6: Права доступа
-- ──────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA sadova1 TO service_role, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA sadova1 TO service_role, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA sadova1 TO service_role, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sadova1 TO service_role, authenticated;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 7: Восстановление public.dashboard_metrics для Гравитона
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_metrics AS
SELECT 
    COALESCE(SUM(deficit_kg), 0) AS total_kg,
    COUNT(*) AS total_sku_count,
    COUNT(*) FILTER (WHERE priority_number = 1) AS critical_sku_count,
    COUNT(*) FILTER (WHERE priority_number = 2) AS high_sku_count,
    COUNT(*) FILTER (WHERE priority_number = 3) AS reserve_sku_count,
    COALESCE(SUM(deficit_kg) FILTER (WHERE priority_number = 1), 0) AS critical_kg,
    COALESCE(SUM(deficit_kg) FILTER (WHERE priority_number = 2), 0) AS high_kg,
    COALESCE(SUM(deficit_kg) FILTER (WHERE priority_number = 3), 0) AS reserve_kg
FROM public.dashboard_deficit;

COMMIT;
