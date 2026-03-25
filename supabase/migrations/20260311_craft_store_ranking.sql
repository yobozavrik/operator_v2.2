-- Update store ranking to include detailed metrics: fresh_sold, disc_sold, cannibalization_pct, waste_uah
CREATE OR REPLACE FUNCTION bakery1.f_craft_get_store_ranking(p_start_date date, p_end_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'top_stores', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON)
            FROM (
                SELECT 
                    store_id, 
                    store_name, 
                    SUM(qty_fresh_sold + qty_disc_sold) as total_sold, 
                    SUM(qty_waste) as total_waste,
                    SUM(qty_fresh_sold) as fresh_sold,
                    SUM(qty_disc_sold) as disc_sold,
                    ROUND(SUM(qty_disc_sold)::NUMERIC / NULLIF(SUM(qty_fresh_sold + qty_disc_sold), 0) * 100, 2) as cannibalization_pct,
                    SUM(qty_waste * (revenue_fresh / NULLIF(qty_fresh_sold, 0))) as waste_uah,
                    ROUND(SUM(qty_waste)::NUMERIC / NULLIF(SUM(qty_fresh_sold + qty_disc_sold + qty_waste), 0) * 100, 2) as waste_pct
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_sold DESC
                LIMIT 5
            ) t
        ),
        'bottom_stores', (
            SELECT COALESCE(json_agg(row_to_json(b)), '[]'::JSON)
            FROM (
                SELECT 
                    store_id, 
                    store_name, 
                    SUM(qty_fresh_sold + qty_disc_sold) as total_sold, 
                    SUM(qty_waste) as total_waste,
                    SUM(qty_fresh_sold) as fresh_sold,
                    SUM(qty_disc_sold) as disc_sold,
                    ROUND(SUM(qty_disc_sold)::NUMERIC / NULLIF(SUM(qty_fresh_sold + qty_disc_sold), 0) * 100, 2) as cannibalization_pct,
                    SUM(qty_waste * (revenue_fresh / NULLIF(qty_fresh_sold, 0))) as waste_uah,
                    ROUND(SUM(qty_waste)::NUMERIC / NULLIF(SUM(qty_fresh_sold + qty_disc_sold + qty_waste), 0) * 100, 2) as waste_pct
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_sold ASC
                LIMIT 5
            ) b
        ),
        'all_stores', (
            SELECT COALESCE(json_agg(row_to_json(a)), '[]'::JSON)
            FROM (
                SELECT 
                    store_id, 
                    store_name, 
                    SUM(qty_fresh_sold + qty_disc_sold) as total_sold, 
                    SUM(qty_waste) as total_waste,
                    SUM(qty_fresh_sold) as fresh_sold,
                    SUM(qty_disc_sold) as disc_sold,
                    ROUND(SUM(qty_disc_sold)::NUMERIC / NULLIF(SUM(qty_fresh_sold + qty_disc_sold), 0) * 100, 2) as cannibalization_pct,
                    SUM(qty_waste * (revenue_fresh / NULLIF(qty_fresh_sold, 0))) as waste_uah,
                    ROUND(SUM(qty_waste)::NUMERIC / NULLIF(SUM(qty_fresh_sold + qty_disc_sold + qty_waste), 0) * 100, 2) as waste_pct
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_sold DESC
            ) a
        ),
        'sku_abc', (
            SELECT COALESCE(json_agg(row_to_json(s)), '[]'::JSON)
            FROM (
                SELECT 
                    sku_id, 
                    sku_name, 
                    SUM(qty_fresh_sold + qty_disc_sold) as total_sold, 
                    SUM(revenue_fresh + revenue_disc) as total_revenue
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_revenue DESC
            ) s
        )
    ) INTO result;
    RETURN COALESCE(result, '{}'::JSON);
END;
$function$;
