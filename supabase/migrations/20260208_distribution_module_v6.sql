-- =============================================
-- SQL Migration v6: Secure Gateway Support (Logs & Params)
-- =============================================

-- 1. Create Logging Table
CREATE TABLE IF NOT EXISTS pizza1.distribution_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at timestamptz DEFAULT now(),
    user_id uuid,
    status text DEFAULT 'running',
    details jsonb
);

-- Enable RLS on logs (restrict access effectively)
ALTER TABLE pizza1.distribution_logs ENABLE ROW LEVEL SECURITY;

-- 2. Update Internal Function Signature (Add Logging)
DROP FUNCTION IF EXISTS pizza1.fn_full_recalculate_all();

CREATE OR REPLACE FUNCTION pizza1.fn_full_recalculate_all(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    r RECORD;
    v_log_id uuid;
BEGIN
    -- [LOGGING] Start
    INSERT INTO pizza1.distribution_logs (user_id, status)
    VALUES (p_user_id, 'running')
    RETURNING id INTO v_log_id;

    -- [LOGIC] Clean up distribution results for the current day (Kyiv time)
    DELETE FROM pizza1.distribution_results
    WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = (NOW() AT TIME ZONE 'Europe/Kyiv')::date;

    -- [LOGIC] Iterate through all items in production
    FOR r IN SELECT product_name FROM pizza1.v_pizza_production_only LOOP
        PERFORM pizza1.auto_distribute_pizza_v2(r.product_name);
    END LOOP;

    -- [LOGGING] Success
    UPDATE pizza1.distribution_logs 
    SET status = 'success' 
    WHERE id = v_log_id;

    RETURN v_log_id;
EXCEPTION WHEN OTHERS THEN
    -- [LOGGING] Error
    UPDATE pizza1.distribution_logs 
    SET status = 'error', details = jsonb_build_object('error', SQLERRM)
    WHERE id = v_log_id;
    RAISE;
END;
$$;

-- 3. Grants
GRANT ALL ON TABLE pizza1.distribution_logs TO service_role; -- API uses service role
GRANT EXECUTE ON FUNCTION pizza1.fn_full_recalculate_all(uuid) TO service_role;
-- We removed 'authenticated' access to this internal function effectively by changing signature 
-- and not granting execute to 'authenticated' directly, forcing use of API Gateway + Service Role. But let's verify.
-- Actually, the previous 'public.rpc_calculate_distribution' will now be broken because it calls fn_full_recalculate_all() without args.
-- We should update the public wrapper too, just in case, or drop it if we are strictly using the API Gateway now.
-- Let's update the public wrapper to match avoiding breaks if frontend calls it directly (though API route is updated).

CREATE OR REPLACE FUNCTION public.rpc_calculate_distribution()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Call with null user_id if called publicly (fallback)
    PERFORM pizza1.fn_full_recalculate_all(auth.uid());
END;
$$;
