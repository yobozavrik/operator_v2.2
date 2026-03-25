CREATE SCHEMA IF NOT EXISTS bulvar1;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS bulvar1.scheduler_config (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled boolean NOT NULL DEFAULT true,
    app_base_url text,
    cron_secret text,
    email_endpoint_path text NOT NULL DEFAULT '/api/bulvar/distribution/scheduled-run',
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bulvar1.scheduler_config
    ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS app_base_url text,
    ADD COLUMN IF NOT EXISTS cron_secret text,
    ADD COLUMN IF NOT EXISTS email_endpoint_path text NOT NULL DEFAULT '/api/bulvar/distribution/scheduled-run',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS bulvar1.distribution_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date date NOT NULL,
    trigger_type text NOT NULL,
    status text NOT NULL,
    recipient_email text,
    calculation_batch_id uuid,
    rows_count integer,
    production_rows_count integer,
    email_subject text,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bulvar1.distribution_jobs
    ADD COLUMN IF NOT EXISTS business_date date,
    ADD COLUMN IF NOT EXISTS trigger_type text,
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS recipient_email text,
    ADD COLUMN IF NOT EXISTS calculation_batch_id uuid,
    ADD COLUMN IF NOT EXISTS rows_count integer,
    ADD COLUMN IF NOT EXISTS production_rows_count integer,
    ADD COLUMN IF NOT EXISTS email_subject text,
    ADD COLUMN IF NOT EXISTS error_message text,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS finished_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bulvar_distribution_jobs_trigger_type_check'
          AND conrelid = 'bulvar1.distribution_jobs'::regclass
    ) THEN
        ALTER TABLE bulvar1.distribution_jobs
            ADD CONSTRAINT bulvar_distribution_jobs_trigger_type_check
            CHECK (trigger_type IN ('scheduled', 'manual'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bulvar_distribution_jobs_status_check'
          AND conrelid = 'bulvar1.distribution_jobs'::regclass
    ) THEN
        ALTER TABLE bulvar1.distribution_jobs
            ADD CONSTRAINT bulvar_distribution_jobs_status_check
            CHECK (
                status IN (
                    'running',
                    'success',
                    'failed',
                    'email_sent',
                    'email_skipped',
                    'email_failed'
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bulvar_dist_jobs_business_date
    ON bulvar1.distribution_jobs (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_bulvar_dist_jobs_status
    ON bulvar1.distribution_jobs (status);
CREATE INDEX IF NOT EXISTS idx_bulvar_dist_jobs_started_at
    ON bulvar1.distribution_jobs (started_at DESC);

CREATE TABLE IF NOT EXISTS bulvar1.distribution_email_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date date NOT NULL,
    job_id uuid REFERENCES bulvar1.distribution_jobs(id) ON DELETE SET NULL,
    recipient_email text,
    subject text,
    sent_at timestamptz,
    status text NOT NULL,
    error_message text,
    payload_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bulvar1.distribution_email_log
    ADD COLUMN IF NOT EXISTS business_date date,
    ADD COLUMN IF NOT EXISTS job_id uuid,
    ADD COLUMN IF NOT EXISTS recipient_email text,
    ADD COLUMN IF NOT EXISTS subject text,
    ADD COLUMN IF NOT EXISTS sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS error_message text,
    ADD COLUMN IF NOT EXISTS payload_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bulvar_distribution_email_log_status_check'
          AND conrelid = 'bulvar1.distribution_email_log'::regclass
    ) THEN
        ALTER TABLE bulvar1.distribution_email_log
            ADD CONSTRAINT bulvar_distribution_email_log_status_check
            CHECK (status IN ('sent', 'skipped', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bulvar_distribution_email_log_job_id_fkey'
          AND conrelid = 'bulvar1.distribution_email_log'::regclass
    ) THEN
        ALTER TABLE bulvar1.distribution_email_log
            ADD CONSTRAINT bulvar_distribution_email_log_job_id_fkey
            FOREIGN KEY (job_id)
            REFERENCES bulvar1.distribution_jobs(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bulvar_email_log_business_date
    ON bulvar1.distribution_email_log (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_bulvar_email_log_job_id
    ON bulvar1.distribution_email_log (job_id);

ALTER TABLE bulvar1.scheduler_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulvar1.distribution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulvar1.distribution_email_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'bulvar1'
          AND tablename = 'scheduler_config'
          AND policyname = 'bulvar_scheduler_config_service_role_all'
    ) THEN
        CREATE POLICY bulvar_scheduler_config_service_role_all
            ON bulvar1.scheduler_config
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'bulvar1'
          AND tablename = 'distribution_jobs'
          AND policyname = 'bulvar_distribution_jobs_service_role_all'
    ) THEN
        CREATE POLICY bulvar_distribution_jobs_service_role_all
            ON bulvar1.distribution_jobs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'bulvar1'
          AND tablename = 'distribution_jobs'
          AND policyname = 'bulvar_distribution_jobs_authenticated_select'
    ) THEN
        CREATE POLICY bulvar_distribution_jobs_authenticated_select
            ON bulvar1.distribution_jobs
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'bulvar1'
          AND tablename = 'distribution_email_log'
          AND policyname = 'bulvar_distribution_email_log_service_role_all'
    ) THEN
        CREATE POLICY bulvar_distribution_email_log_service_role_all
            ON bulvar1.distribution_email_log
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'bulvar1'
          AND tablename = 'distribution_email_log'
          AND policyname = 'bulvar_distribution_email_log_authenticated_select'
    ) THEN
        CREATE POLICY bulvar_distribution_email_log_authenticated_select
            ON bulvar1.distribution_email_log
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

GRANT USAGE ON SCHEMA bulvar1 TO authenticated, service_role;
GRANT SELECT ON bulvar1.distribution_jobs TO authenticated;
GRANT SELECT ON bulvar1.distribution_email_log TO authenticated;
GRANT ALL ON bulvar1.scheduler_config TO service_role;
GRANT ALL ON bulvar1.distribution_jobs TO service_role;
GRANT ALL ON bulvar1.distribution_email_log TO service_role;

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
    SELECT *
    INTO v_config
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
                'email_request_id', v_request_id
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

DO $$
DECLARE
    v_job_id bigint;
BEGIN
    SELECT jobid
    INTO v_job_id
    FROM cron.job
    WHERE jobname = 'bulvar-nightly-distribution-hourly'
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;
END $$;

SELECT cron.schedule(
    'bulvar-nightly-distribution-hourly',
    '0 * * * *',
    $$SELECT bulvar1.fn_run_scheduled_distribution_job(false);$$
);
