CREATE OR REPLACE FUNCTION bulvar1.fn_trigger_distribution_email(
    p_business_date date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date,
    p_job_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Email is sent only by the application scheduled-run endpoint via Resend.
    -- Keep the function for backward compatibility, but make it a no-op in SQL.
    RETURN NULL;
END;
$function$;

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
        jsonb_build_object('source', 'pg_cron', 'email_delivery', 'application_resend')
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
                'email_delivery', 'application_resend',
                'email_request_enqueued', false
            )
        WHERE id = v_job_id;

        RETURN v_job_id;
    EXCEPTION
        WHEN OTHERS THEN
            UPDATE bulvar1.distribution_jobs
            SET status = 'failed',
                error_message = SQLERRM,
                finished_at = now(),
                updated_at = now(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'source', 'pg_cron',
                    'email_delivery', 'application_resend'
                )
            WHERE id = v_job_id;
            RAISE;
    END;
END;
$function$;
