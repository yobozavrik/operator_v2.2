-- ============================================================
-- Migration: re-anchor pizza simulator input view to merge-view
-- Date: 2026-03-29
-- Scope:
--   - keep public.f_plan_production_ndays unchanged
--   - keep simulator batch mechanics unchanged
--   - move pizza1.v_pizza_stats_with_effective_stock from
--       pizza1.v_pizza_distribution_stats_v2
--     to
--       pizza1.v_pizza_distribution_stats
--
-- Why:
--   The pizza UI and OOS rollout already use pizza1.v_pizza_distribution_stats
--   as the live source of truth for avg_sales_day/min_stock.
--   The simulator still reads an older v2 branch through
--   pizza1.v_pizza_stats_with_effective_stock.
--
-- Result:
--   - simulator keeps effective_stock-based planning
--   - simulator starts using live merged avg_sales_day/min_stock
--   - no change to public.f_plan_production_ndays signature or logic
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW pizza1.v_pizza_stats_with_effective_stock AS
SELECT
    vp.product_id,
    vp.product_name,
    vp.spot_name,
    vp.avg_sales_day,
    vp.min_stock,
    vp.stock_now,
    COALESCE(ve.effective_stock, (vp.stock_now)::numeric) AS effective_stock,
    COALESCE(ve.physical_stock, (vp.stock_now)::numeric) AS physical_stock,
    COALESCE(ve.virtual_stock, (0)::bigint) AS virtual_stock,
    vp.baked_at_factory,
    vp.need_net
FROM pizza1.v_pizza_distribution_stats vp
LEFT JOIN pizza1.v_effective_stocks ve
    ON ve.ingredient_name = vp.product_name
   AND regexp_replace(ve.storage_name, '^Магазин \"(.+)\"$'::text, '\1'::text) = vp.spot_name;

COMMENT ON VIEW pizza1.v_pizza_stats_with_effective_stock IS
    'Simulator bridge view. Uses live pizza1.v_pizza_distribution_stats for avg_sales_day/min_stock/stock_now '
    'and joins pizza1.v_effective_stocks to expose effective_stock/physical_stock/virtual_stock. '
    'Keeps public.f_plan_production_ndays unchanged while aligning simulator inputs with the live merge-view.';

GRANT SELECT ON pizza1.v_pizza_stats_with_effective_stock TO service_role, authenticated;

COMMIT;
