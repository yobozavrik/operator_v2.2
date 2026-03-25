-- =============================================
-- SQL Migration v4: Distribution Module (Final Strict Spec)
-- =============================================

-- 1. CRITICAL: Schema Access Permissions (Fix for 500 Error)
-- Without USAGE, the API cannot access objects in the pizza1 schema.
GRANT USAGE ON SCHEMA pizza1 TO authenticated;
GRANT USAGE ON SCHEMA pizza1 TO anon;
GRANT USAGE ON SCHEMA pizza1 TO service_role;

-- =============================================
-- 2. RPC Function: pizza1.fn_full_recalculate_all
-- =============================================
-- Logic:
-- 1. Clean up old results for today (Kyiv time).
-- 2. Iterate through currently produced items.
-- 3. Trigger distribution logic for each item.
-- Returns: VOID (as per spec).

CREATE OR REPLACE FUNCTION pizza1.fn_full_recalculate_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    r RECORD;
BEGIN
    -- 1. Clean up distribution results for the current day (Kyiv time)
    -- Using ::date cast on timestamp with time zone ensures correct day boundary
    DELETE FROM pizza1.distribution_results
    WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

    -- 2. Iterate through all items in production (v_pizza_production_only)
    -- This view should contain items that have 'baked_qty' > 0
    FOR r IN SELECT product_name FROM pizza1.v_pizza_production_only LOOP
        -- Call the distribution logic for each product
        -- Using 'PERFORM' for void function calls or when ignoring result
        PERFORM pizza1.auto_distribute_pizza_v2(r.product_name);
    END LOOP;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO authenticated;
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO anon;
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO service_role;


-- =============================================
-- 3. View: public.v_today_distribution
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

-- Grant select permission
GRANT SELECT ON public.v_today_distribution TO authenticated;
GRANT SELECT ON public.v_today_distribution TO anon;
GRANT SELECT ON public.v_today_distribution TO service_role;

-- Cleanup deprecated view
DROP VIEW IF EXISTS public.v_production_ready_status;
