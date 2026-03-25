CREATE OR REPLACE FUNCTION bakery1.f_craft_get_network_metrics(p_start_date DATE, p_end_date DATE)
RETURNS JSON AS $$
DECLARE
    result JSON;
    v_days_diff INTEGER;
    v_prev_start_date DATE;
    v_prev_end_date DATE;
BEGIN
    v_days_diff := p_end_date - p_start_date;
    v_prev_start_date := p_start_date - (v_days_diff + 1);
    v_prev_end_date := p_end_date - (v_days_diff + 1);

    SELECT json_build_object(
        'qty_delivered', SUM(qty_delivered),
        'qty_fresh_sold', SUM(qty_fresh_sold),
        'qty_disc_sold', SUM(qty_disc_sold),
        'qty_waste', SUM(qty_waste),
        'revenue_fresh', SUM(revenue_fresh),
        'revenue_disc', SUM(revenue_disc),
        'waste_rate', CASE WHEN SUM(qty_delivered) > 0 THEN ROUND(SUM(qty_waste)::NUMERIC / SUM(qty_delivered) * 100, 2) ELSE 0 END,
        'sell_through_rate', CASE WHEN SUM(qty_delivered) > 0 THEN ROUND((SUM(qty_fresh_sold) + SUM(qty_disc_sold))::NUMERIC / SUM(qty_delivered) * 100, 2) ELSE 0 END,
        
        -- Daily trends for the current period
        'trend_current', (
            SELECT COALESCE(json_agg(row_to_json(curr)), '[]'::JSON)
            FROM (
                SELECT 
                    date, 
                    SUM(qty_fresh_sold + qty_disc_sold) as total_sold,
                    SUM(qty_waste) as total_waste,
                    SUM(qty_delivered) as total_delivered
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY date
                ORDER BY date ASC
            ) curr
        ),
        
        -- Daily trends for the previous equivalent period
        'trend_previous', (
            SELECT COALESCE(json_agg(row_to_json(prev)), '[]'::JSON)
            FROM (
                SELECT 
                    date, 
                    SUM(qty_fresh_sold + qty_disc_sold) as total_sold,
                    SUM(qty_waste) as total_waste,
                    SUM(qty_delivered) as total_delivered
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= v_prev_start_date AND date <= v_prev_end_date
                GROUP BY date
                ORDER BY date ASC
            ) prev
        )
    ) INTO result
    FROM bakery1.mv_craft_daily_mart
    WHERE date >= p_start_date AND date <= p_end_date;
    
    RETURN COALESCE(result, '{}'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
