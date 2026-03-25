-- =============================================
-- 1. RPC Function: pizza1.fn_full_recalculate_all
-- =============================================
-- This function triggers the distribution logic for all items currently in production.
-- It cleans up previous results for the current day and recalculates.

CREATE OR REPLACE FUNCTION pizza1.fn_full_recalculate_all()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with the privileges of the creator (should have access to pizza1 schema)
AS $$
DECLARE
    r RECORD;
    cnt INT := 0;
BEGIN
    -- 1. Clean up distribution results for the current day (Kyiv time)
    DELETE FROM pizza1.distribution_results
    WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = CURRENT_DATE;

    -- 2. Iterate through all items in production (v_pizza_production_only)
    FOR r IN SELECT product_name, total_qty_kg, baked_qty FROM pizza1.v_pizza_production_only LOOP
        -- Call the distribution logic for each product
        -- Assuming 'pizza1.fn_distribute_product' handles the actual logic for a single product.
        -- If the logic is inline or different, adjust here.
        -- Example call:
        PERFORM pizza1.auto_distribute_pizza_v2(r.product_name);
        
        cnt := cnt + 1;
    END LOOP;

    RETURN 'Успешно обновлено ' || cnt || ' позиций';
END;
$$;

-- Grant execute permission to authenticated users (so the API can call it)
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all() TO authenticated;
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
WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = CURRENT_DATE;

-- Grant select permission
GRANT SELECT ON public.v_today_distribution TO authenticated;
GRANT SELECT ON public.v_today_distribution TO service_role;


-- =============================================
-- 3. View: public.v_production_ready_status
-- =============================================
-- Checks if there are any items in production ready for distribution.
-- Used to enable/disable the "Calculate" button on the frontend.

CREATE OR REPLACE VIEW public.v_production_ready_status AS
SELECT count(*) as prod_count 
FROM pizza1.v_pizza_production_only;

-- Grant select permission
GRANT SELECT ON public.v_production_ready_status TO authenticated;
GRANT SELECT ON public.v_production_ready_status TO service_role;
