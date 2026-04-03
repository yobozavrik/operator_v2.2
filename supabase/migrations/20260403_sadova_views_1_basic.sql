CREATE OR REPLACE VIEW sadova1.v_effective_stocks AS
SELECT s.storage_id,
    st.storage_name,
    s.ingredient_id,
    s.ingredient_name,
    s.storage_ingredient_left AS physical_stock,
    COALESCE(pending.pending_qty, (0)::bigint) AS virtual_stock,
    (s.storage_ingredient_left + (COALESCE(pending.pending_qty, (0)::bigint))::numeric) AS effective_stock,
    s.ingredient_unit
   FROM ((sadova1.stocks_now s
     JOIN categories.storages st ON ((st.storage_id = s.storage_id)))
     LEFT JOIN ( SELECT dr.spot_name,
            dr.product_name,
            sum(dr.quantity_to_ship) AS pending_qty
           FROM sadova1.distribution_results dr
          WHERE ((dr.delivery_status = 'pending'::text) AND (dr.business_date = CURRENT_DATE))
          GROUP BY dr.spot_name, dr.product_name) pending ON (((pending.spot_name = st.storage_name) AND (pending.product_name = s.ingredient_name))))
  WHERE (s.ingredient_id IN ( SELECT production_catalog.product_id
           FROM sadova1.production_catalog
          WHERE (production_catalog.is_active = true)));

CREATE OR REPLACE VIEW sadova1.v_sadova_stats AS
SELECT db."код_продукту" AS product_id,
    db."назва_продукту" AS product_name,
    db.category_name,
    db."код_магазину" AS storage_id,
    db."назва_магазину" AS spot_name,
    db.current_stock AS stock_now,
    db.avg_sales_day,
    db.min_stock,
    GREATEST((0)::numeric, (db.min_stock - db.current_stock)) AS deficit
   FROM sadova1.distribution_base db
  WHERE ((db."код_продукту" IN ( SELECT production_catalog.product_id
           FROM sadova1.production_catalog
          WHERE (production_catalog.is_active = true))) AND (db."код_магазину" IN ( SELECT distribution_shops.spot_id
           FROM sadova1.distribution_shops
          WHERE (distribution_shops.is_active = true))));

CREATE OR REPLACE VIEW sadova1.v_morning_leftovers AS
SELECT l.snapshot_date,
    l.storage_id,
    l.ingredient_id,
    l.ingredient_name,
    l.ingredient_left,
    l.storage_ingredient_left,
    l.limit_value,
    l.ingredient_unit,
    l.ingredients_type,
    l.storage_ingredient_sum,
    l.storage_ingredient_sum_netto,
    l.prime_cost,
    l.prime_cost_netto,
    l.hidden,
    l.loaded_at,
    l.api_response_raw
   FROM (leftovers.daily_snapshots l
     JOIN sadova1.distribution_shops ds ON ((l.storage_id = ds.storage_id)))
  WHERE (ds.is_active = true);

CREATE OR REPLACE VIEW sadova1.v_production_logic AS
SELECT mi.product_id,
    max(mi.product_name) AS product_name,
    (round(sum(mi.quantity)))::integer AS baked_qty
   FROM (sadova1.manufacture_items mi
     JOIN sadova1.manufactures m ON ((m.manufacture_id = mi.manufacture_id)))
  WHERE ((m.manufacture_date >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Kiev'::text))::date) AND (mi.is_deleted IS NOT TRUE) AND (m.storage_id = 2))
  GROUP BY mi.product_id;

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

CREATE OR REPLACE VIEW public.v_sadova_plan_d1 AS
WITH base_stats AS (
         SELECT v_sadova_stats_with_effective_stock.product_id,
            v_sadova_stats_with_effective_stock.product_name,
            v_sadova_stats_with_effective_stock.category_name,
            sum(v_sadova_stats_with_effective_stock.avg_sales_day) AS daily_avg_network,
            sum(v_sadova_stats_with_effective_stock.effective_stock) AS effective_stock_d0,
            sum(GREATEST((0)::numeric, (v_sadova_stats_with_effective_stock.min_stock - v_sadova_stats_with_effective_stock.effective_stock))) AS deficit_d0,
            count(*) FILTER (WHERE (v_sadova_stats_with_effective_stock.effective_stock <= (0)::numeric)) AS zero_shops,
            sum(v_sadova_stats_with_effective_stock.min_stock) AS norm_network
           FROM sadova1.v_sadova_stats_with_effective_stock
          GROUP BY v_sadova_stats_with_effective_stock.product_id, v_sadova_stats_with_effective_stock.product_name, v_sadova_stats_with_effective_stock.category_name
        ), with_need AS (
         SELECT base_stats.product_id,
            base_stats.product_name,
            base_stats.category_name,
            base_stats.daily_avg_network,
            base_stats.effective_stock_d0,
            base_stats.deficit_d0,
            base_stats.zero_shops,
            base_stats.norm_network,
            (base_stats.deficit_d0 + base_stats.daily_avg_network) AS raw_need,
            ((base_stats.daily_avg_network * (base_stats.deficit_d0 / NULLIF(base_stats.norm_network, (0)::numeric))) * (100)::numeric) AS risk_index
           FROM base_stats
          WHERE ((base_stats.deficit_d0 > (0)::numeric) OR (base_stats.zero_shops > 0))
        ), with_portions AS (
         SELECT n.product_id,
            n.product_name,
            n.category_name,
            n.daily_avg_network,
            n.effective_stock_d0,
            n.deficit_d0,
            n.zero_shops,
            n.norm_network,
            n.raw_need,
            n.risk_index,
            pc.portion_size,
            (ceil((n.raw_need / pc.portion_size)) * pc.portion_size) AS base_qty
           FROM (with_need n
             LEFT JOIN sadova1.production_catalog pc ON ((n.product_id = pc.product_id)))
        ), ranked AS (
         SELECT with_portions.product_id,
            with_portions.product_name,
            with_portions.category_name,
            with_portions.daily_avg_network,
            with_portions.effective_stock_d0,
            with_portions.deficit_d0,
            with_portions.zero_shops,
            with_portions.norm_network,
            with_portions.raw_need,
            with_portions.risk_index,
            with_portions.portion_size,
            with_portions.base_qty,
            row_number() OVER (ORDER BY with_portions.risk_index DESC) AS rank,
            sum(with_portions.base_qty) OVER (ORDER BY with_portions.risk_index DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
           FROM with_portions
        )
 SELECT ranked.rank,
    ranked.product_id,
    ranked.product_name,
    ranked.category_name,
    ranked.daily_avg_network AS daily_avg,
    ranked.effective_stock_d0,
    ranked.deficit_d0,
    ranked.raw_need,
    ranked.portion_size,
    ranked.base_qty,
        CASE
            WHEN (ranked.running_total <= (495)::numeric) THEN ranked.base_qty
            ELSE (0)::numeric
        END AS final_qty,
    ranked.risk_index,
    ranked.zero_shops
   FROM ranked
  WHERE (ranked.running_total <= (495)::numeric)
  ORDER BY ranked.rank;

CREATE OR REPLACE VIEW public.v_sadova_plan_d1_detailed AS
SELECT gs.product_name,
    COALESCE(c.category_name, 'Без категории'::text) AS category_name,
    gs.spot_name AS store_name,
    gs.effective_stock AS current_stock,
    gs.min_stock,
    gs.avg_sales_day,
    GREATEST((0)::numeric, (gs.min_stock - gs.effective_stock)) AS deficit_kg,
    (gs.avg_sales_day * (1)::numeric) AS recommended_kg,
        CASE
            WHEN (gs.effective_stock <= (0)::numeric) THEN 1
            WHEN (gs.effective_stock < gs.min_stock) THEN 2
            ELSE 3
        END AS priority_number,
        CASE
            WHEN (gs.effective_stock <= (0)::numeric) THEN 'critical'::text
            WHEN (gs.effective_stock < gs.min_stock) THEN 'high'::text
            ELSE 'reserve'::text
        END AS priority
   FROM ((sadova1.v_sadova_stats_with_effective_stock gs
     LEFT JOIN categories.products p ON ((p.name = gs.product_name)))
     LEFT JOIN categories.categories c ON ((c.category_id = p.category_id)))
  WHERE (gs.effective_stock < gs.min_stock)
  ORDER BY
        CASE
            WHEN (gs.effective_stock <= (0)::numeric) THEN 1
            WHEN (gs.effective_stock < gs.min_stock) THEN 2
            ELSE 3
        END, gs.product_name, gs.spot_name;

CREATE OR REPLACE VIEW public.v_sadova_plan_d2 AS
SELECT f_calculate_evening_d2.out_product_name AS product_name,
    sum(f_calculate_evening_d2.out_allocated_qty) AS allocated_d2,
    row_number() OVER (ORDER BY (sum(f_calculate_evening_d2.out_allocated_qty)) DESC) AS rank
   FROM sadova1.f_calculate_evening_d2() f_calculate_evening_d2(out_product_id, out_product_name, out_spot_name, out_stock_d0, out_stock_d1_evening, out_allocated_qty, out_stock_d2_morning, out_stock_d2_evening, out_avg_sales_day, out_min_stock, out_deficit_d2)
  GROUP BY f_calculate_evening_d2.out_product_name
 HAVING (sum(f_calculate_evening_d2.out_allocated_qty) > (0)::numeric)
  ORDER BY (sum(f_calculate_evening_d2.out_allocated_qty)) DESC;

CREATE OR REPLACE VIEW public.v_sadova_critical_d2 AS
SELECT f_calculate_evening_d2.out_product_name AS product_name,
    count(*) FILTER (WHERE (f_calculate_evening_d2.out_stock_d2_evening <= (0)::numeric)) AS zeros_d2,
    sum(
        CASE
            WHEN (f_calculate_evening_d2.out_deficit_d2 > (0)::numeric) THEN f_calculate_evening_d2.out_deficit_d2
            ELSE (0)::numeric
        END) AS deficit_d2,
    sum(f_calculate_evening_d2.out_stock_d2_evening) AS total_stock_d2
   FROM sadova1.f_calculate_evening_d2() f_calculate_evening_d2(out_product_id, out_product_name, out_spot_name, out_stock_d0, out_stock_d1_evening, out_allocated_qty, out_stock_d2_morning, out_stock_d2_evening, out_avg_sales_day, out_min_stock, out_deficit_d2)
  GROUP BY f_calculate_evening_d2.out_product_name
 HAVING ((count(*) FILTER (WHERE (f_calculate_evening_d2.out_stock_d2_evening <= (0)::numeric)) > 0) OR (sum(
        CASE
            WHEN (f_calculate_evening_d2.out_deficit_d2 > (0)::numeric) THEN f_calculate_evening_d2.out_deficit_d2
            ELSE (0)::numeric
        END) > (0)::numeric))
  ORDER BY (count(*) FILTER (WHERE (f_calculate_evening_d2.out_stock_d2_evening <= (0)::numeric))) DESC, (sum(
        CASE
            WHEN (f_calculate_evening_d2.out_deficit_d2 > (0)::numeric) THEN f_calculate_evening_d2.out_deficit_d2
            ELSE (0)::numeric
        END)) DESC;

CREATE OR REPLACE VIEW public.v_sadova_critical_d3 AS
SELECT f_calculate_evening_d3.result_product_name AS product_name,
    count(*) FILTER (WHERE (f_calculate_evening_d3.result_stock_d3_evening <= (0)::numeric)) AS zeros_d3,
    sum(
        CASE
            WHEN (f_calculate_evening_d3.result_deficit_d3 > (0)::numeric) THEN f_calculate_evening_d3.result_deficit_d3
            ELSE (0)::numeric
        END) AS deficit_d3,
    sum(f_calculate_evening_d3.result_stock_d3_evening) AS total_stock_d3
   FROM sadova1.f_calculate_evening_d3() f_calculate_evening_d3(result_product_id, result_product_name, result_spot_name, result_stock_d2_evening, result_allocated_qty, result_stock_d3_morning, result_stock_d3_evening, result_avg_sales_day, result_min_stock, result_deficit_d3)
  GROUP BY f_calculate_evening_d3.result_product_name
 HAVING ((count(*) FILTER (WHERE (f_calculate_evening_d3.result_stock_d3_evening <= (0)::numeric)) > 0) OR (sum(
        CASE
            WHEN (f_calculate_evening_d3.result_deficit_d3 > (0)::numeric) THEN f_calculate_evening_d3.result_deficit_d3
            ELSE (0)::numeric
        END) > (0)::numeric))
  ORDER BY (count(*) FILTER (WHERE (f_calculate_evening_d3.result_stock_d3_evening <= (0)::numeric))) DESC, (sum(
        CASE
            WHEN (f_calculate_evening_d3.result_deficit_d3 > (0)::numeric) THEN f_calculate_evening_d3.result_deficit_d3
            ELSE (0)::numeric
        END)) DESC;

\n-- Functions:\n\n\n