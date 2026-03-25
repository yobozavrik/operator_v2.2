CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Restore SQL -> API trigger call (pg_net HTTP POST).
CREATE OR REPLACE FUNCTION bulvar1.fn_trigger_distribution_email(
    p_business_date date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date,
    p_job_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_config bulvar1.scheduler_config%ROWTYPE;
    v_url text;
    v_request_id bigint;
BEGIN
    SELECT * INTO v_config
    FROM bulvar1.scheduler_config
    WHERE id = 1;

    IF v_config.id IS NULL OR NOT COALESCE(v_config.enabled, false) THEN
        RETURN NULL;
    END IF;

    IF COALESCE(NULLIF(trim(v_config.app_base_url), ''), '') = '' THEN
        RETURN NULL;
    END IF;

    IF COALESCE(NULLIF(trim(v_config.cron_secret), ''), '') = '' THEN
        RETURN NULL;
    END IF;

    v_url := rtrim(v_config.app_base_url, '/') || COALESCE(v_config.email_endpoint_path, '/api/bulvar/distribution/scheduled-run');
    v_url := v_url || '?date=' || p_business_date::text;

    IF p_job_id IS NOT NULL THEN
        v_url := v_url || '&job_id=' || p_job_id::text;
    END IF;

    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', v_config.cron_secret
        ),
        body := '{}'::jsonb
    )
    INTO v_request_id;

    RETURN v_request_id;
END;
$function$;

-- Restore enqueue metadata + request_id writeback.
CREATE OR REPLACE FUNCTION bulvar1.fn_run_scheduled_distribution_job(
    p_force boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $function$
DECLARE
    v_business_date date := (now() AT TIME ZONE 'Europe/Kyiv')::date;
    v_kyiv_hour integer := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/Kyiv'));
    v_job_id uuid;
    v_batch_id uuid;
    v_rows_count integer := 0;
    v_production_rows_count integer := 0;
    v_request_id bigint;
BEGIN
    IF NOT p_force AND v_kyiv_hour <> 23 THEN
        RETURN NULL;
    END IF;

    IF NOT p_force THEN
        SELECT id
        INTO v_job_id
        FROM bulvar1.distribution_jobs
        WHERE business_date = v_business_date
          AND trigger_type = 'scheduled'
          AND status IN ('success', 'email_sent', 'email_skipped')
        ORDER BY started_at DESC
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            RETURN v_job_id;
        END IF;
    END IF;

    INSERT INTO bulvar1.distribution_jobs (
        business_date,
        trigger_type,
        status,
        email_subject,
        metadata
    )
    VALUES (
        v_business_date,
        'scheduled',
        'running',
        'Bulvar distribution ' || v_business_date::text,
        jsonb_build_object('source', 'pg_cron')
    )
    RETURNING id INTO v_job_id;

    BEGIN
        v_batch_id := bulvar1.fn_full_recalculate_all();

        SELECT COUNT(*)
        INTO v_rows_count
        FROM bulvar1.distribution_results
        WHERE business_date = v_business_date;

        SELECT COUNT(*)
        INTO v_production_rows_count
        FROM bulvar1.v_bulvar_production_only
        WHERE baked_at_factory > 0;

        UPDATE bulvar1.distribution_jobs
        SET status = 'success',
            calculation_batch_id = v_batch_id,
            rows_count = v_rows_count,
            production_rows_count = v_production_rows_count,
            finished_at = now(),
            updated_at = now(),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'source', 'pg_cron',
                'email_request_enqueued', true
            )
        WHERE id = v_job_id;

        v_request_id := bulvar1.fn_trigger_distribution_email(v_business_date, v_job_id);

        UPDATE bulvar1.distribution_jobs
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'source', 'pg_cron',
                'email_request_id', v_request_id,
                'email_request_enqueued', (v_request_id IS NOT NULL)
            ),
            updated_at = now()
        WHERE id = v_job_id;

        RETURN v_job_id;
    EXCEPTION
        WHEN OTHERS THEN
            UPDATE bulvar1.distribution_jobs
            SET status = 'failed',
                error_message = SQLERRM,
                finished_at = now(),
                updated_at = now(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('source', 'pg_cron')
            WHERE id = v_job_id;
            RAISE;
    END;
END;
$function$;

GRANT EXECUTE ON FUNCTION bulvar1.fn_trigger_distribution_email(date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION bulvar1.fn_run_scheduled_distribution_job(boolean) TO service_role;

-- Reschedule to run at :30 each hour; function itself gates to hour=23 Kyiv.
DO $$
DECLARE
    v_job_id bigint;
BEGIN
    FOR v_job_id IN
        SELECT jobid
        FROM cron.job
        WHERE jobname IN ('bulvar-nightly-distribution-hourly', 'bulvar-nightly-distribution-2330')
    LOOP
        PERFORM cron.unschedule(v_job_id);
    END LOOP;
END $$;

SELECT cron.schedule(
    'bulvar-nightly-distribution-2330',
    '30 * * * *',
    $$SELECT bulvar1.fn_run_scheduled_distribution_job(false);$$
);
