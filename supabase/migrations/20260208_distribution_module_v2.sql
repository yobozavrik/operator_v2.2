-- =============================================
-- 1. RPC Function: pizza1.fn_full_recalculate_all
-- =============================================
-- This function triggers the distribution logic for all items currently in production.
-- SECURITY DEFINER: Runs with privileges of the creator to modify 'pizza1' schema data.

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
        -- Example call:
        PERFORM pizza1.auto_distribute_pizza_v2(r.product_name);
        
        cnt := cnt + 1;
    END LOOP;

    RETURN 'Успешно обновлено ' || cnt || ' позиций';
END;
$$;

-- Grant execute permission to authenticated AND anon users (for API access)
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO authenticated;
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO anon;
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO service_role;


-- =============================================
-- 2. View: public.v_today_distribution
-- =============================================
-- Shows distribution results for the current day.
-- Accessible by the frontend via public schema.

CREATE OR REPLACE VIEW public.v_today_distribution AS
SELECT 
    product_name,
    spot_name,
    quantity_to_ship,
    created_at AT TIME ZONE 'Europe/Kyiv' as calc_time
FROM pizza1.distribution_results
WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

-- Grant select permission to authenticated AND anon users
GRANT SELECT ON public.v_today_distribution TO authenticated;
GRANT SELECT ON public.v_today_distribution TO anon;
GRANT SELECT ON public.v_today_distribution TO service_role;

-- Drop obsolete view if it exists (cleanup)
DROP VIEW IF EXISTS public.v_production_ready_status;
