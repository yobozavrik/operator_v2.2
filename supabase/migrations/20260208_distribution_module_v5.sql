-- =============================================
-- SQL Migration v5: Public Wrapper for Distribution (Final Security Fix)
-- =============================================

-- 1. Ensure Internal Logic Exists (pizza1 schema)
-- This function handles the actual business logic.
CREATE OR REPLACE FUNCTION pizza1.fn_full_recalculate_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    r RECORD;
BEGIN
    -- Clean up distribution results for the current day (Kyiv time)
    DELETE FROM pizza1.distribution_results
    WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

    -- Iterate through all items in production
    FOR r IN SELECT product_name FROM pizza1.v_pizza_production_only LOOP
        PERFORM pizza1.auto_distribute_pizza_v2(r.product_name);
    END LOOP;
END;
$$;

-- 2. CREATE PUBLIC WRAPPER (The Fix)
-- This function is exposed to the API. It is SECURITY DEFINER, so it runs with admin rights,
-- allowing it to call the internal pizza1 function without exposing the schema directly.
CREATE OR REPLACE FUNCTION public.rpc_calculate_distribution()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM pizza1.fn_full_recalculate_all();
END;
$$;

-- 3. Permissions for the Wrapper
-- Grant EXECUTE on the PUBLIC wrapper to API roles.
GRANT EXECUTE ON FUNCTION public.rpc_calculate_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_calculate_distribution() TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_calculate_distribution() TO service_role;

-- 4. Ensure View Exists and is Accessible
CREATE OR REPLACE VIEW public.v_today_distribution AS
SELECT 
    product_name,
    spot_name,
    quantity_to_ship,
    created_at AT TIME ZONE 'Europe/Kyiv' as calc_time
FROM pizza1.distribution_results
WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

GRANT SELECT ON public.v_today_distribution TO authenticated;
GRANT SELECT ON public.v_today_distribution TO anon;
GRANT SELECT ON public.v_today_distribution TO service_role;
