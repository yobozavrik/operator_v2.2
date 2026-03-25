-- Migration: Fix Konditerka Storage ID and Create Simulator Function
-- Date: 2026-03-10

-- 1. Fix the Konditerka Production View (was using storage 15/pizza, should be 48/konditerka)
CREATE OR REPLACE VIEW konditerka1.v_konditerka_production_only AS
SELECT mi.product_id,
       mi.product_name,
       (sum(mi.quantity))::integer AS baked_at_factory,
       max(m.manufacture_date) AS last_update
FROM pizza1.manufacture_items mi
JOIN pizza1.manufactures m ON mi.manufacture_id = m.manufacture_id
JOIN categories.products p ON mi.product_id = p.id
JOIN categories.categories c ON p.category_id = c.category_id
WHERE m.storage_id = 48 -- FIXED: Using Konditerka storage ID
  AND m.manufacture_date >= CURRENT_DATE 
  AND mi.is_deleted IS NOT TRUE
  AND (c.category_name ILIKE '%кондите%' OR c.category_name ILIKE '%десерт%' OR c.category_name ILIKE '%солодк%' OR c.category_name ILIKE '%морозив%')
GROUP BY mi.product_id, mi.product_name;

-- 2. Create the Planning Function for the Simulator
CREATE OR REPLACE FUNCTION public.f_plan_konditerka_production_ndays(
    p_days integer,
    p_capacity integer DEFAULT 320
)
 RETURNS TABLE(
    plan_day integer, 
    product_name text, 
    quantity integer, 
    risk_index numeric,
    prod_rank integer,
    plan_metadata jsonb
)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    d int;
    r record;
    v_current_capacity int;
    v_item_qty int := 20; -- Standard batch for Konditerka
BEGIN
    -- Temporary table to track virtual stocks over simulated days
    CREATE TEMP TABLE IF NOT EXISTS virtual_stock_k (
        p_name text PRIMARY KEY, 
        v_stock numeric, 
        v_daily_avg numeric, 
        v_target numeric,
        category_name text
    ) ON COMMIT DROP;

    TRUNCATE virtual_stock_k;

    -- Initialize with current real-time stats
    INSERT INTO virtual_stock_k (p_name, v_stock, v_daily_avg, v_target, category_name)
    SELECT 
        stats.product_name, 
        SUM(stats.stock_now), 
        SUM(stats.avg_sales_day), 
        SUM(stats.min_stock),
        CASE WHEN stats.product_name ILIKE '%морозиво%' OR stats.product_name ILIKE '%сорбет%' THEN 'Морозиво' ELSE 'Кондитерка' END
    FROM konditerka1.v_konditerka_distribution_stats stats
    WHERE stats.avg_sales_day > 0 
    GROUP BY stats.product_name;

    FOR d IN 1..p_days LOOP
        v_current_capacity := 0;
        prod_rank := 1;

        -- We simulate production until capacity is reached for the day
        WHILE v_current_capacity < p_capacity LOOP
            -- Find the item with the highest risk (lowest stock relative to target)
            SELECT p_name, v_daily_avg, v_stock, v_target,
                   ROUND((v_daily_avg * (GREATEST(0, v_target - v_stock) / NULLIF(v_target, 0)) * 100) 
                   + (CASE WHEN v_stock <= 0 THEN 500 ELSE 0 END), 0) as risk
            INTO r
            FROM virtual_stock_k 
            WHERE v_daily_avg > 0
            ORDER BY risk DESC, v_daily_avg DESC 
            LIMIT 1;

            EXIT WHEN r IS NULL OR r.risk <= 0; -- No more items need production

            plan_day := d;
            product_name := r.p_name;
            quantity := v_item_qty;
            risk_index := r.risk;
            plan_metadata := jsonb_build_object(
                'deficit', GREATEST(0, r.v_target - r.v_stock),
                'avg_sales', r.v_daily_avg,
                'category', (SELECT category_name FROM virtual_stock_k WHERE p_name = r.p_name)
            );

            RETURN NEXT;

            -- Update virtual stock for next iterations
            UPDATE virtual_stock_k 
            SET v_stock = v_stock + v_item_qty 
            WHERE p_name = r.p_name;

            v_current_capacity := v_current_capacity + v_item_qty;
            prod_rank := prod_rank + 1;
            
            -- Safety break if we are stuck (should not happen with risk <= 0 check)
            IF prod_rank > 100 THEN EXIT; END IF;
        END LOOP;
        
        -- End of day decay: subtract average daily sales from virtual stock
        UPDATE virtual_stock_k 
        SET v_stock = GREATEST(0, v_stock - v_daily_avg);
    END LOOP;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.f_plan_konditerka_production_ndays(integer, integer) TO authenticated, anon, service_role;
