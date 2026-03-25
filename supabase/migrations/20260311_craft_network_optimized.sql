CREATE OR REPLACE FUNCTION bakery1.f_craft_get_network_metrics(p_start_date date, p_end_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result JSON;
    v_days_diff INTEGER;
    v_prev_start_date DATE;
    v_prev_end_date DATE;
BEGIN
    v_days_diff := p_end_date - p_start_date;
    v_prev_start_date := p_start_date - (v_days_diff + 1);
    v_prev_end_date := p_end_date - (v_days_diff + 1);

    WITH raw_data AS (
        SELECT 
            date,
            SUM(qty_delivered) as qty_delivered,
            SUM(qty_fresh_sold) as qty_fresh_sold,
            SUM(qty_disc_sold) as qty_disc_sold,
            SUM(qty_waste) as qty_waste,
            SUM(revenue_fresh) as revenue_fresh,
            SUM(revenue_disc) as revenue_disc,
            SUM(qty_waste * (revenue_fresh / NULLIF(qty_fresh_sold, 0))) as waste_uah,
            SUM(CASE WHEN qty_delivered > 0 AND qty_waste = 0 AND qty_disc_sold = 0 AND qty_fresh_sold = qty_delivered 
                     THEN revenue_fresh * 0.15 ELSE 0 END) as lost_revenue
        FROM bakery1.mv_craft_daily_mart
        WHERE (date >= p_start_date AND date <= p_end_date) 
           OR (date >= v_prev_start_date AND date <= v_prev_end_date)
        GROUP BY date
    ),
    trend_current AS (
        SELECT 
            date, 
            qty_fresh_sold + qty_disc_sold as total_sold,
            qty_waste as total_waste,
            qty_delivered as total_delivered
        FROM raw_data
        WHERE date >= p_start_date AND date <= p_end_date
        ORDER BY date ASC
    ),
    trend_previous AS (
        SELECT 
            date, 
            qty_fresh_sold + qty_disc_sold as total_sold,
            qty_waste as total_waste,
            qty_delivered as total_delivered
        FROM raw_data
        WHERE date >= v_prev_start_date AND date <= v_prev_end_date
        ORDER BY date ASC
    ),
    base_metrics AS (
        SELECT 
            SUM(qty_delivered) as qty_delivered,
            SUM(qty_fresh_sold) as qty_fresh_sold,
            SUM(qty_disc_sold) as qty_disc_sold,
            SUM(qty_waste) as qty_waste,
            SUM(revenue_fresh) as revenue_fresh,
            SUM(revenue_disc) as revenue_disc,
            SUM(waste_uah) as waste_uah,
            SUM(lost_revenue) as lost_revenue
        FROM raw_data
        WHERE date >= p_start_date AND date <= p_end_date
    )
    SELECT json_build_object(
        'qty_delivered', COALESCE(qty_delivered, 0),
        'qty_fresh_sold', COALESCE(qty_fresh_sold, 0),
        'qty_disc_sold', COALESCE(qty_disc_sold, 0),
        'qty_waste', COALESCE(qty_waste, 0),
        'revenue_fresh', COALESCE(revenue_fresh, 0),
        'revenue_disc', COALESCE(revenue_disc, 0),
        'waste_uah', ROUND(COALESCE(waste_uah, 0), 0),
        'lost_revenue', ROUND(COALESCE(lost_revenue, 0), 0),
        'waste_rate', CASE WHEN qty_delivered > 0 THEN ROUND(qty_waste::NUMERIC / qty_delivered * 100, 2) ELSE 0 END,
        'sell_through_rate', CASE WHEN qty_delivered > 0 THEN ROUND((qty_fresh_sold + qty_disc_sold)::NUMERIC / qty_delivered * 100, 2) ELSE 0 END,
        
        'trend_current', (SELECT COALESCE(json_agg(row_to_json(tc)), '[]'::JSON) FROM trend_current tc),
        'trend_previous', (SELECT COALESCE(json_agg(row_to_json(tp)), '[]'::JSON) FROM trend_previous tp)
    ) INTO result
    FROM base_metrics;
    
    RETURN COALESCE(result, '{}'::JSON);
END;
$function$;
