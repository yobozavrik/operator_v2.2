-- Bulvar best-practice hardening: indexing + safe orchestrator lock

CREATE INDEX IF NOT EXISTS idx_bulvar_dist_results_business_date
ON bulvar1.distribution_results (business_date);

CREATE INDEX IF NOT EXISTS idx_bulvar_dist_results_batch_id
ON bulvar1.distribution_results (calculation_batch_id);

CREATE INDEX IF NOT EXISTS idx_bulvar_dist_results_business_date_spot
ON bulvar1.distribution_results (business_date, spot_name);

CREATE OR REPLACE FUNCTION bulvar1.fn_full_recalculate_all()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $function$
DECLARE
    r record;
    v_batch_id uuid := gen_random_uuid();
    v_business_date date := (now() AT TIME ZONE 'Europe/Kyiv')::date;
    v_lock_key bigint := hashtextextended('bulvar1.fn_full_recalculate_all', 0);
    v_locked boolean;
BEGIN
    SELECT pg_try_advisory_lock(v_lock_key) INTO v_locked;
    IF NOT v_locked THEN
        RAISE EXCEPTION 'Distribution is already running'
            USING ERRCODE = '55P03';
    END IF;

    DELETE FROM bulvar1.distribution_results
    WHERE business_date = v_business_date;

    FOR r IN
        SELECT DISTINCT product_id
        FROM bulvar1.v_bulvar_production_only
        WHERE baked_at_factory > 0
        ORDER BY product_id
    LOOP
        PERFORM bulvar1.fn_run_distribution_v3(
            p_product_id := r.product_id,
            p_batch_id := v_batch_id,
            p_business_date := v_business_date,
            p_allow_warehouse_row := true
        );
    END LOOP;

    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN v_batch_id;

EXCEPTION
    WHEN OTHERS THEN
        PERFORM pg_advisory_unlock(v_lock_key);
        RAISE;
END;
$function$;
