-- =============================================
-- 1. CRITICAL: Schema Access Permissions (Fix for 500 Error)
-- =============================================
-- Without USAGE, the API cannot access objects in the pizza1 schema, even if EXECUTE is granted.
GRANT USAGE ON SCHEMA pizza1 TO authenticated;
GRANT USAGE ON SCHEMA pizza1 TO anon;
GRANT USAGE ON SCHEMA pizza1 TO service_role;


-- =============================================
-- 2. RPC Function: pizza1.fn_full_recalculate_all
-- =============================================
CREATE OR REPLACE FUNCTION pizza1.fn_full_recalculate_all()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    r RECORD;
    cnt INT := 0;
BEGIN
    -- 1. Clean up distribution results for the current day (Kyiv time)
    DELETE FROM pizza1.distribution_results
    WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

    -- 2. Iterate through all items in production (v_pizza_production_only)
    FOR r IN SELECT product_name, total_qty_kg, baked_qty FROM pizza1.v_pizza_production_only LOOP
        -- Call the distribution logic for each product
        PERFORM pizza1.auto_distribute_pizza_v2(r.product_name);
        cnt := cnt + 1;
    END LOOP;

    RETURN 'Успешно обновлено ' || cnt || ' позиций';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO authenticated;
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO anon;
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO service_role;


-- =============================================
-- 3. View: public.v_today_distribution
-- =============================================
CREATE OR REPLACE VIEW public.v_today_distribution AS
SELECT 
    product_name,
    spot_name,
    quantity_to_ship,
    created_at AT TIME ZONE 'Europe/Kyiv' as calc_time
FROM pizza1.distribution_results
WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

-- Grant select permission
GRANT SELECT ON public.v_today_distribution TO authenticated;
GRANT SELECT ON public.v_today_distribution TO anon;
GRANT SELECT ON public.v_today_distribution TO service_role;

-- Cleanup
DROP VIEW IF EXISTS public.v_production_ready_status;
