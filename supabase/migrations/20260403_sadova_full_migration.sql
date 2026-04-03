-- ==============================================================
-- САДОВА: Полная миграция VIEW и функций
-- Порядок: зависимость на зависимость
-- Вставить ЦЕЛИКОМ в Supabase SQL Editor и нажать RUN
-- ==============================================================

-- ──────────────────────────────────────────────────────────────
-- ШАГ 1: Базовые VIEW (не зависят от других VIEW)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW sadova1.v_effective_stocks AS
WITH latest_stocks AS (
    SELECT DISTINCT ON (storage_id, product_id)
        storage_id,
        product_id       AS ingredient_id,
        product_name     AS ingredient_name,
        stock_left       AS storage_ingredient_left,
        unit             AS ingredient_unit
    FROM sadova1.distribution_input_stocks
    WHERE business_date = CURRENT_DATE
    ORDER BY storage_id, product_id, created_at DESC
)
SELECT
    s.storage_id,
    st.storage_name,
    s.ingredient_id,
    s.ingredient_name,
    s.storage_ingredient_left AS physical_stock,
    COALESCE(pending.pending_qty, 0::bigint) AS virtual_stock,
    (s.storage_ingredient_left + COALESCE(pending.pending_qty, 0::bigint)::numeric) AS effective_stock,
    s.ingredient_unit
FROM latest_stocks s
JOIN categories.storages st ON st.storage_id = s.storage_id
LEFT JOIN (
    SELECT dr.spot_name, dr.product_name, sum(dr.quantity_to_ship) AS pending_qty
    FROM sadova1.distribution_results dr
    WHERE dr.delivery_status = 'pending' AND dr.business_date = CURRENT_DATE
    GROUP BY dr.spot_name, dr.product_name
) pending ON pending.spot_name = st.storage_name AND pending.product_name = s.ingredient_name
WHERE s.ingredient_id IN (
    SELECT product_id FROM sadova1.production_catalog WHERE is_active = true
);

CREATE OR REPLACE VIEW sadova1.v_sadova_stats AS
SELECT db.product_id,
    db.product_name,
    db.category_name,
    db.spot_id AS storage_id, -- В Sadova spot_id в distribution_base соответствует складу
    db.spot_name,
    db.current_stock AS stock_now,
    db.avg_sales_day,
    db.min_stock,
    GREATEST((0)::numeric, (db.min_stock - db.current_stock)) AS deficit
   FROM sadova1.distribution_base db
  WHERE db.product_id IN ( SELECT production_catalog.product_id
           FROM sadova1.production_catalog
          WHERE production_catalog.is_active = true)
    AND db.spot_id IN ( SELECT distribution_shops.spot_id
           FROM sadova1.distribution_shops
          WHERE distribution_shops.is_active = true);

-- NOTE: sadova1 не имеет схемы leftovers. v_morning_leftovers строится из distribution_input_stocks.
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
  AND s.business_date = (
    SELECT MAX(business_date) FROM sadova1.distribution_input_stocks
  );

CREATE OR REPLACE VIEW sadova1.v_production_logic AS
SELECT
    p.product_id,
    max(p.product_name) AS product_name,
    round(sum(p.quantity))::integer AS baked_qty
FROM sadova1.distribution_input_production p
WHERE p.business_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kiev')::date
  AND p.storage_id = 34 -- Hub storage Sadova (Магазин/Цех)
GROUP BY p.product_id;

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
   FROM (sadova1.distribution_results dr
     LEFT JOIN sadova1.production_catalog pc ON ((dr.product_id = pc.product_id)))
  WHERE (dr.business_date = CURRENT_DATE)
  GROUP BY dr.product_id, dr.product_name, dr.business_date, pc.category_id, pc.category_name, pc.portion_size, pc.unit, pc.is_active
  ORDER BY pc.category_name, dr.product_name;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 2: Составной VIEW (зависит от v_sadova_stats + v_effective_stocks)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW sadova1.v_sadova_stats_with_effective_stock AS
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
   FROM (sadova1.v_sadova_stats gs
     LEFT JOIN sadova1.v_effective_stocks ve ON (((ve.ingredient_id = gs.product_id) AND (ve.storage_id = gs.storage_id))));

-- ──────────────────────────────────────────────────────────────
-- ШАГ 3: Функция f_plan_production_1day (нужна для D2/D3)
-- ──────────────────────────────────────────────────────────────

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
            gs.product_id,
            gs.product_name,
            gs.category_name,
            SUM(gs.effective_stock) as total_stock,
            SUM(gs.avg_sales_day) as daily_avg,
            SUM(gs.min_stock) as norm_network,
            SUM(GREATEST(0, gs.min_stock - gs.effective_stock)) as deficit,
            COUNT(*) FILTER (WHERE gs.effective_stock <= 0) as zeros
        FROM sadova1.v_sadova_stats_with_effective_stock gs
        GROUP BY gs.product_id, gs.product_name, gs.category_name
        HAVING SUM(GREATEST(0, gs.min_stock - gs.effective_stock)) > 0
    ),
    needs AS (
        SELECT
            bs.product_id,
            bs.product_name,
            bs.category_name,
            bs.daily_avg,
            bs.total_stock,
            bs.deficit,
            bs.deficit + bs.daily_avg as raw_need,
            ROUND(bs.daily_avg * (bs.deficit::numeric / NULLIF(bs.norm_network, 0)) * 100, 0) as risk_idx,
            bs.zeros,
            pc.portion_size,
            CEIL((bs.deficit + bs.daily_avg) / pc.portion_size) * pc.portion_size as base_qty
        FROM base_stats bs
        JOIN sadova1.production_catalog pc ON pc.product_id = bs.product_id
    ),
    ranked AS (
        SELECT
            ROW_NUMBER() OVER (ORDER BY n.risk_idx DESC, n.product_name)::INT as rnk,
            n.*
        FROM needs n
    )
    SELECT
        r.rnk,
        r.product_id,
        r.product_name,
        r.category_name,
        r.daily_avg,
        r.total_stock,
        r.deficit,
        r.raw_need,
        r.portion_size,
        r.base_qty,
        0::NUMERIC as final_qty,
        r.risk_idx,
        r.zeros
    FROM ranked r
    ORDER BY r.rnk;

    FOR v_rec IN
        SELECT * FROM temp_sadova_order ORDER BY rnk
    LOOP
        IF v_running_total + v_rec.base_qty <= v_capacity THEN
            UPDATE temp_sadova_order t
            SET final_qty = v_rec.base_qty
            WHERE t.product_id = v_rec.product_id;
            v_running_total := v_running_total + v_rec.base_qty;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    v_remainder := v_capacity - v_running_total;

    IF v_remainder > 0 THEN
        SELECT t.product_id, t.portion_size
        INTO v_top_product_id, v_top_portion_size
        FROM temp_sadova_order t
        WHERE t.final_qty > 0
        ORDER BY t.rnk
        LIMIT 1;

        IF v_top_product_id IS NOT NULL AND v_remainder >= v_top_portion_size THEN
            UPDATE temp_sadova_order t
            SET final_qty = t.final_qty + (FLOOR(v_remainder / v_top_portion_size) * v_top_portion_size)
            WHERE t.product_id = v_top_product_id;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        t.rnk::INT,
        t.product_id::INT,
        t.product_name,
        t.category_name,
        t.daily_avg,
        t.total_stock,
        t.deficit,
        t.raw_need,
        t.portion_size,
        t.base_qty,
        t.final_qty,
        t.risk_idx,
        t.zeros::INT
    FROM temp_sadova_order t
    WHERE t.final_qty > 0
    ORDER BY t.rnk;

END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 4: Функция f_calculate_evening_d2 (нужна для VIEW D2/D3)
-- ──────────────────────────────────────────────────────────────

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

    CREATE TEMP TABLE temp_order_d1 AS
    SELECT product_id, product_name, final_qty
    FROM sadova1.f_plan_production_1day()
    WHERE final_qty > 0;

    CREATE TEMP TABLE temp_evening_d1 AS
    SELECT
        product_id::int,
        product_name,
        spot_name,
        FLOOR(effective_stock + 0.3)::numeric as d0_stock,
        GREATEST(0, FLOOR(effective_stock - avg_sales_day + 0.3))::numeric as d1_eve_stock,
        avg_sales_day::numeric as sales_avg,
        min_stock::numeric as norm_stock,
        0::numeric as alloc_qty
    FROM sadova1.v_sadova_stats_with_effective_stock;

    FOR v_order_rec IN SELECT * FROM temp_order_d1 LOOP
        v_pool := v_order_rec.final_qty;

        DROP TABLE IF EXISTS temp_calc;
        CREATE TEMP TABLE temp_calc AS
        SELECT
            spot_name,
            sales_avg,
            norm_stock,
            d1_eve_stock as eff_stock,
            0::numeric as fin_qty,
            0::numeric as tmp_need
        FROM temp_evening_d1
        WHERE product_id = v_order_rec.product_id;

        SELECT COUNT(*) INTO v_zeros_count FROM temp_calc WHERE eff_stock <= 0;

        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc SET fin_qty = 1
            WHERE spot_name IN (
                SELECT spot_name FROM temp_calc
                WHERE eff_stock <= 0
                ORDER BY sales_avg DESC, spot_name ASC
                LIMIT v_pool::int
            );
            v_pool := 0;
        ELSE
            UPDATE temp_calc SET fin_qty = 1 WHERE eff_stock <= 0;
            v_pool := v_pool - v_zeros_count;
        END IF;

        IF v_pool > 0 THEN
            UPDATE temp_calc
            SET tmp_need = GREATEST(0, norm_stock - (eff_stock + fin_qty))
            WHERE TRUE;

            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc;

            IF v_total_need > 0 THEN
                IF v_pool < v_total_need THEN
                    v_k := v_pool::numeric / v_total_need::numeric;
                    UPDATE temp_calc
                    SET fin_qty = fin_qty + FLOOR(tmp_need * v_k)
                    WHERE TRUE;

                    SELECT (v_pool - SUM(FLOOR(tmp_need * v_k)))::numeric INTO v_remainder FROM temp_calc;
                    IF v_remainder > 0 THEN
                        UPDATE temp_calc SET fin_qty = fin_qty + 1
                        WHERE spot_name IN (
                            SELECT spot_name FROM temp_calc
                            WHERE tmp_need > 0
                            ORDER BY sales_avg DESC, spot_name ASC
                            LIMIT v_remainder::int
                        );
                    END IF;
                    v_pool := 0;
                ELSE
                    UPDATE temp_calc SET fin_qty = fin_qty + tmp_need WHERE TRUE;
                    v_pool := v_pool - v_total_need;
                END IF;
            END IF;
        END IF;

        v_multiplier := 2;
        WHILE v_pool > 0 LOOP
            UPDATE temp_calc
            SET tmp_need = GREATEST(0, (norm_stock * v_multiplier) - (eff_stock + fin_qty))
            WHERE TRUE;

            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc;
            EXIT WHEN v_total_need = 0 OR v_multiplier > 15;

            IF v_pool < v_total_need THEN
                v_k := v_pool::numeric / v_total_need::numeric;
                UPDATE temp_calc SET fin_qty = fin_qty + FLOOR(tmp_need * v_k) WHERE TRUE;

                SELECT (v_pool - SUM(FLOOR(tmp_need * v_k)))::numeric INTO v_remainder FROM temp_calc;
                IF v_remainder > 0 THEN
                    UPDATE temp_calc SET fin_qty = fin_qty + 1
                    WHERE spot_name IN (
                        SELECT spot_name FROM temp_calc
                        WHERE tmp_need > 0
                        ORDER BY sales_avg DESC, spot_name ASC
                        LIMIT v_remainder::int
                    );
                END IF;
                v_pool := 0;
            ELSE
                UPDATE temp_calc SET fin_qty = fin_qty + tmp_need WHERE TRUE;
                v_pool := v_pool - v_total_need;
                v_multiplier := v_multiplier + 1;
            END IF;
        END LOOP;

        UPDATE temp_evening_d1 e
        SET alloc_qty = c.fin_qty
        FROM temp_calc c
        WHERE e.product_id = v_order_rec.product_id AND e.spot_name = c.spot_name;

        DROP TABLE temp_calc;
    END LOOP;

    RETURN QUERY
    SELECT
        e.product_id::INT,
        e.product_name::TEXT,
        e.spot_name::TEXT,
        e.d0_stock::NUMERIC,
        e.d1_eve_stock::NUMERIC,
        e.alloc_qty::NUMERIC,
        (e.d1_eve_stock + e.alloc_qty)::NUMERIC,
        GREATEST(0, FLOOR((e.d1_eve_stock + e.alloc_qty) - e.sales_avg + 0.3))::NUMERIC,
        e.sales_avg::NUMERIC,
        e.norm_stock::NUMERIC,
        GREATEST(0, e.norm_stock - GREATEST(0, FLOOR((e.d1_eve_stock + e.alloc_qty) - e.sales_avg + 0.3)))::NUMERIC
    FROM temp_evening_d1 e
    ORDER BY e.product_name, e.spot_name;

END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 5: Функция f_calculate_evening_d3
-- ──────────────────────────────────────────────────────────────

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
    DROP TABLE IF EXISTS temp_order_d2_g3;

    CREATE TEMP TABLE temp_evening_d2_g3 AS
    SELECT
        out_product_id::int as product_id,
        out_product_name as product_name,
        out_spot_name as spot_name,
        out_stock_d2_evening as d2_eve_stock,
        out_avg_sales_day as sales_avg,
        out_min_stock as norm_stock,
        0::numeric as alloc_qty
    FROM sadova1.f_calculate_evening_d2();

    CREATE TEMP TABLE temp_order_d2_g3 AS
    WITH d2_stats AS (
        SELECT
            product_id,
            product_name,
            SUM(GREATEST(0, norm_stock - d2_eve_stock)) as deficit,
            SUM(sales_avg) as daily_avg,
            SUM(norm_stock) as norm_network
        FROM temp_evening_d2_g3
        GROUP BY product_id, product_name
        HAVING SUM(GREATEST(0, norm_stock - d2_eve_stock)) > 0
    )
    SELECT
        s.product_id,
        s.product_name,
        ROUND(s.daily_avg * (s.deficit / NULLIF(s.norm_network, 0)) * 100, 0) as risk_idx,
        pc.portion_size,
        CEIL((s.deficit + s.daily_avg) / pc.portion_size) * pc.portion_size as base_qty,
        0::numeric as final_qty
    FROM d2_stats s
    JOIN sadova1.production_catalog pc ON pc.product_id = s.product_id
    ORDER BY risk_idx DESC, s.product_name;

    FOR v_order_rec IN
        SELECT * FROM temp_order_d2_g3 ORDER BY risk_idx DESC
    LOOP
        IF v_running_total + v_order_rec.base_qty <= v_capacity THEN
            UPDATE temp_order_d2_g3 t
            SET final_qty = v_order_rec.base_qty
            WHERE t.product_id = v_order_rec.product_id;
            v_running_total := v_running_total + v_order_rec.base_qty;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    FOR v_order_rec IN
        SELECT * FROM temp_order_d2_g3 WHERE final_qty > 0
    LOOP
        v_pool := v_order_rec.final_qty;

        DROP TABLE IF EXISTS temp_calc_g3;
        CREATE TEMP TABLE temp_calc_g3 AS
        SELECT
            spot_name,
            sales_avg,
            norm_stock,
            d2_eve_stock as eff_stock,
            0::numeric as fin_qty,
            0::numeric as tmp_need
        FROM temp_evening_d2_g3
        WHERE product_id = v_order_rec.product_id;

        SELECT COUNT(*) INTO v_zeros_count FROM temp_calc_g3 WHERE eff_stock <= 0;

        IF v_zeros_count > 0 THEN
            IF v_pool <= v_zeros_count THEN
                UPDATE temp_calc_g3 SET fin_qty = 1
                WHERE spot_name IN (
                    SELECT spot_name FROM temp_calc_g3
                    WHERE eff_stock <= 0
                    ORDER BY sales_avg DESC
                    LIMIT v_pool::int
                );
                v_pool := 0;
            ELSE
                UPDATE temp_calc_g3 SET fin_qty = 1 WHERE eff_stock <= 0;
                v_pool := v_pool - v_zeros_count;
            END IF;
        END IF;

        IF v_pool > 0 THEN
            UPDATE temp_calc_g3
            SET tmp_need = GREATEST(0, norm_stock - (eff_stock + fin_qty))
            WHERE TRUE;

            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc_g3;

            IF v_total_need > 0 THEN
                IF v_pool < v_total_need THEN
                    v_k := v_pool / v_total_need;
                    UPDATE temp_calc_g3 SET fin_qty = fin_qty + FLOOR(tmp_need * v_k) WHERE TRUE;
                    v_remainder := v_pool - (SELECT SUM(FLOOR(tmp_need * v_k)) FROM temp_calc_g3);
                    IF v_remainder > 0 THEN
                        UPDATE temp_calc_g3 SET fin_qty = fin_qty + 1
                        WHERE spot_name IN (
                            SELECT spot_name FROM temp_calc_g3
                            WHERE tmp_need > 0
                            ORDER BY sales_avg DESC
                            LIMIT v_remainder::int
                        );
                    END IF;
                    v_pool := 0;
                ELSE
                    UPDATE temp_calc_g3 SET fin_qty = fin_qty + tmp_need WHERE TRUE;
                    v_pool := v_pool - v_total_need;
                END IF;
            END IF;
        END IF;

        v_multiplier := 2;
        WHILE v_pool > 0 AND v_multiplier <= 15 LOOP
            UPDATE temp_calc_g3
            SET tmp_need = GREATEST(0, (norm_stock * v_multiplier) - (eff_stock + fin_qty))
            WHERE TRUE;
            SELECT SUM(tmp_need) INTO v_total_need FROM temp_calc_g3;
            EXIT WHEN v_total_need = 0;

            IF v_pool < v_total_need THEN
                v_k := v_pool / v_total_need;
                UPDATE temp_calc_g3 SET fin_qty = fin_qty + FLOOR(tmp_need * v_k) WHERE TRUE;
                v_remainder := v_pool - (SELECT SUM(FLOOR(tmp_need * v_k)) FROM temp_calc_g3);
                IF v_remainder > 0 THEN
                    UPDATE temp_calc_g3 SET fin_qty = fin_qty + 1
                    WHERE spot_name IN (
                        SELECT spot_name FROM temp_calc_g3
                        WHERE tmp_need > 0
                        ORDER BY sales_avg DESC
                        LIMIT v_remainder::int
                    );
                END IF;
                v_pool := 0;
            ELSE
                UPDATE temp_calc_g3 SET fin_qty = fin_qty + tmp_need WHERE TRUE;
                v_pool := v_pool - v_total_need;
                v_multiplier := v_multiplier + 1;
            END IF;
        END LOOP;

        UPDATE temp_evening_d2_g3 e
        SET alloc_qty = c.fin_qty
        FROM temp_calc_g3 c
        WHERE e.product_id = v_order_rec.product_id AND e.spot_name = c.spot_name;
    END LOOP;

    RETURN QUERY
    SELECT
        e.product_id::INT,
        e.product_name::TEXT,
        e.spot_name::TEXT,
        e.d2_eve_stock::NUMERIC,
        e.alloc_qty::NUMERIC,
        (e.d2_eve_stock + e.alloc_qty)::NUMERIC,
        GREATEST(0, FLOOR((e.d2_eve_stock + e.alloc_qty) - e.sales_avg + 0.3))::NUMERIC,
        e.sales_avg::NUMERIC,
        e.norm_stock::NUMERIC,
        GREATEST(0, e.norm_stock - GREATEST(0, FLOOR((e.d2_eve_stock + e.alloc_qty) - e.sales_avg + 0.3)))::NUMERIC
    FROM temp_evening_d2_g3 e
    ORDER BY e.product_name, e.spot_name;

END;
$function$;

-- ──────────────────────────────────────────────────────────────
-- ШАГ 6: VIEW в public (зависят от функций выше)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_sadova_results_public AS
SELECT distribution_results.id,
    distribution_results.product_name AS "Название продукта",
    distribution_results.spot_name AS "Магазин",
    distribution_results.quantity_to_ship AS "Количество",
    distribution_results.created_at AS "Время расчета"
   FROM sadova1.distribution_results
  WHERE ((distribution_results.created_at)::date = CURRENT_DATE)
  ORDER BY distribution_results.product_name, distribution_results.spot_name;

CREATE OR REPLACE VIEW public.v_sadova_production_tasks AS
SELECT v_production_tasks.product_id,
    v_production_tasks.product_name,
    v_production_tasks.business_date,
    v_production_tasks.category_id,
    v_production_tasks.category_name,
    v_production_tasks.total_demand_kg,
    v_production_tasks.portion_weight_kg,
    v_production_tasks.unit,
    v_production_tasks.portions_needed,
    v_production_tasks.actual_production_kg,
    v_production_tasks.in_production_catalog
   FROM sadova1.v_production_tasks;

CREATE OR REPLACE VIEW public.v_sadova_plan_d1 AS
WITH base_stats AS (
    SELECT v.product_id, v.product_name, v.category_name,
        sum(v.avg_sales_day) AS daily_avg_network,
        sum(v.effective_stock) AS effective_stock_d0,
        sum(GREATEST(0::numeric, v.min_stock - v.effective_stock)) AS deficit_d0,
        count(*) FILTER (WHERE v.effective_stock <= 0) AS zero_shops,
        sum(v.min_stock) AS norm_network
    FROM sadova1.v_sadova_stats_with_effective_stock v
    GROUP BY v.product_id, v.product_name, v.category_name
), with_need AS (
    SELECT bs.*,
        bs.deficit_d0 + bs.daily_avg_network AS raw_need,
        bs.daily_avg_network * (bs.deficit_d0 / NULLIF(bs.norm_network, 0)) * 100 AS risk_index
    FROM base_stats bs
    WHERE bs.deficit_d0 > 0 OR bs.zero_shops > 0
), with_portions AS (
    SELECT n.*, pc.portion_size,
        ceil(n.raw_need / pc.portion_size) * pc.portion_size AS base_qty
    FROM with_need n
    LEFT JOIN sadova1.production_catalog pc ON n.product_id = pc.product_id
), ranked AS (
    SELECT wp.*,
        row_number() OVER (ORDER BY wp.risk_index DESC) AS rank,
        sum(wp.base_qty) OVER (ORDER BY wp.risk_index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
    FROM with_portions wp
)
SELECT rank, product_id, product_name, category_name,
    daily_avg_network AS daily_avg,
    effective_stock_d0, deficit_d0, raw_need, portion_size, base_qty,
    CASE WHEN running_total <= 495 THEN base_qty ELSE 0 END AS final_qty,
    risk_index, zero_shops
FROM ranked
WHERE running_total <= 495
ORDER BY rank;

CREATE OR REPLACE VIEW public.v_sadova_plan_d1_detailed AS
SELECT gs.product_name,
    COALESCE(c.category_name, 'Без категорії'::text) AS category_name,
    gs.spot_name AS store_name,
    gs.effective_stock AS current_stock,
    gs.min_stock,
    gs.avg_sales_day,
    GREATEST(0::numeric, gs.min_stock - gs.effective_stock) AS deficit_kg,
    gs.avg_sales_day * 1 AS recommended_kg,
    CASE
        WHEN gs.effective_stock <= 0 THEN 1
        WHEN gs.effective_stock < gs.min_stock THEN 2
        ELSE 3
    END AS priority_number,
    CASE
        WHEN gs.effective_stock <= 0 THEN 'critical'
        WHEN gs.effective_stock < gs.min_stock THEN 'high'
        ELSE 'reserve'
    END AS priority
FROM sadova1.v_sadova_stats_with_effective_stock gs
LEFT JOIN categories.products p ON p.name = gs.product_name
LEFT JOIN categories.categories c ON c.category_id = p.category_id
WHERE gs.effective_stock < gs.min_stock
ORDER BY priority_number, gs.product_name, gs.spot_name;

CREATE OR REPLACE VIEW public.v_sadova_plan_d2 AS
SELECT out_product_name AS product_name,
    sum(out_allocated_qty) AS allocated_d2,
    row_number() OVER (ORDER BY sum(out_allocated_qty) DESC) AS rank
FROM sadova1.f_calculate_evening_d2()
GROUP BY out_product_name
HAVING sum(out_allocated_qty) > 0
ORDER BY sum(out_allocated_qty) DESC;

CREATE OR REPLACE VIEW public.v_sadova_critical_d2 AS
SELECT out_product_name AS product_name,
    count(*) FILTER (WHERE out_stock_d2_evening <= 0) AS zeros_d2,
    sum(CASE WHEN out_deficit_d2 > 0 THEN out_deficit_d2 ELSE 0 END) AS deficit_d2,
    sum(out_stock_d2_evening) AS total_stock_d2
FROM sadova1.f_calculate_evening_d2()
GROUP BY out_product_name
HAVING count(*) FILTER (WHERE out_stock_d2_evening <= 0) > 0
    OR sum(CASE WHEN out_deficit_d2 > 0 THEN out_deficit_d2 ELSE 0 END) > 0
ORDER BY zeros_d2 DESC, deficit_d2 DESC;

CREATE OR REPLACE VIEW public.v_sadova_critical_d3 AS
SELECT result_product_name AS product_name,
    count(*) FILTER (WHERE result_stock_d3_evening <= 0) AS zeros_d3,
    sum(CASE WHEN result_deficit_d3 > 0 THEN result_deficit_d3 ELSE 0 END) AS deficit_d3,
    sum(result_stock_d3_evening) AS total_stock_d3
FROM sadova1.f_calculate_evening_d3()
GROUP BY result_product_name
HAVING count(*) FILTER (WHERE result_stock_d3_evening <= 0) > 0
    OR sum(CASE WHEN result_deficit_d3 > 0 THEN result_deficit_d3 ELSE 0 END) > 0
ORDER BY zeros_d3 DESC, deficit_d3 DESC;

-- ──────────────────────────────────────────────────────────────
-- ПРОВЕРКА: Убедись что VIEW созданы
-- ──────────────────────────────────────────────────────────────

SELECT table_schema, table_name
FROM information_schema.views
WHERE table_name LIKE 'v_sadova%' OR (table_schema = 'sadova1' AND table_name LIKE 'v_%')
ORDER BY table_schema, table_name;
