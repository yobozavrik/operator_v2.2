-- =============================================
-- SQL Migration v7: Missing Analytics Views
-- =============================================

-- 1. Create v_pub_analytics (Fix for 500 Error on /api/pizza/analytics)
-- Aggregates data from v_pizza_distribution_stats for the dashboard KPI card
CREATE OR REPLACE VIEW public.v_pub_analytics AS
WITH summary AS (
    SELECT
        -- Using COALESCE and column names from user logs/transformers
        SUM(COALESCE(stock_now, 0)) as total_stock,
        SUM(COALESCE(need_net, 0)) as total_need,
        SUM(COALESCE(norm_3_days, 0)) as total_norm
    FROM public.v_pizza_distribution_stats
)
SELECT
    total_stock as current_stock,
    total_need as total_need,
    total_norm as total_target,
    CASE 
        WHEN total_norm > 0 THEN ROUND((total_stock::numeric / total_norm::numeric) * 100, 1) 
        ELSE 0 
    END as fill_level
FROM summary;

-- Grant permissions
GRANT SELECT ON public.v_pub_analytics TO authenticated;
GRANT SELECT ON public.v_pub_analytics TO anon;
GRANT SELECT ON public.v_pub_analytics TO service_role;


-- 2. Create v_pub_radar (Fix for missing radar data)
-- Aggregates stock per product for risk analysis
CREATE OR REPLACE VIEW public.v_pub_radar AS
SELECT
    product_name as pizza_name,
    SUM(COALESCE(stock_now, 0)) as shop_stock,
    -- Calculate Risk Index: High Deficit % = High Risk
    CASE 
        WHEN SUM(COALESCE(norm_3_days, 0)) > 0 THEN
            GREATEST(0, 100 - ROUND((SUM(COALESCE(stock_now, 0))::numeric / SUM(COALESCE(norm_3_days, 0))::numeric) * 100, 1))
        ELSE 0 
    END as risk_index
FROM public.v_pizza_distribution_stats
GROUP BY product_name;

-- Grant permissions
GRANT SELECT ON public.v_pub_radar TO authenticated;
GRANT SELECT ON public.v_pub_radar TO anon;
GRANT SELECT ON public.v_pub_radar TO service_role;
