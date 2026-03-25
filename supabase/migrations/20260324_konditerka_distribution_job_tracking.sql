-- Konditerka distribution: job/email tracking (Florida parity).
-- Safe migration: idempotent DDL only.

CREATE SCHEMA IF NOT EXISTS konditerka1;

CREATE TABLE IF NOT EXISTS konditerka1.distribution_jobs (
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

ALTER TABLE konditerka1.distribution_jobs
    ADD COLUMN IF NOT EXISTS business_date date,
    ADD COLUMN IF NOT EXISTS trigger_type text,
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS recipient_email text,
    ADD COLUMN IF NOT EXISTS calculation_batch_id uuid,
    ADD COLUMN IF NOT EXISTS rows_count integer,
    ADD COLUMN IF NOT EXISTS production_rows_count integer,
    ADD COLUMN IF NOT EXISTS email_subject text,
    ADD COLUMN IF NOT EXISTS error_message text,
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS finished_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'konditerka_distribution_jobs_trigger_type_check'
          AND conrelid = 'konditerka1.distribution_jobs'::regclass
    ) THEN
        ALTER TABLE konditerka1.distribution_jobs
            ADD CONSTRAINT konditerka_distribution_jobs_trigger_type_check
            CHECK (trigger_type IN ('scheduled', 'manual'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'konditerka_distribution_jobs_status_check'
          AND conrelid = 'konditerka1.distribution_jobs'::regclass
    ) THEN
        ALTER TABLE konditerka1.distribution_jobs
            ADD CONSTRAINT konditerka_distribution_jobs_status_check
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

CREATE INDEX IF NOT EXISTS idx_konditerka_dist_jobs_business_date
    ON konditerka1.distribution_jobs (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_konditerka_dist_jobs_status
    ON konditerka1.distribution_jobs (status);
CREATE INDEX IF NOT EXISTS idx_konditerka_dist_jobs_started_at
    ON konditerka1.distribution_jobs (started_at DESC);

CREATE TABLE IF NOT EXISTS konditerka1.distribution_email_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date date NOT NULL,
    job_id uuid REFERENCES konditerka1.distribution_jobs(id) ON DELETE SET NULL,
    recipient_email text,
    subject text,
    sent_at timestamptz,
    status text NOT NULL,
    error_message text,
    payload_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE konditerka1.distribution_email_log
    ADD COLUMN IF NOT EXISTS business_date date,
    ADD COLUMN IF NOT EXISTS job_id uuid,
    ADD COLUMN IF NOT EXISTS recipient_email text,
    ADD COLUMN IF NOT EXISTS subject text,
    ADD COLUMN IF NOT EXISTS sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS error_message text,
    ADD COLUMN IF NOT EXISTS payload_meta jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'konditerka_distribution_email_log_status_check'
          AND conrelid = 'konditerka1.distribution_email_log'::regclass
    ) THEN
        ALTER TABLE konditerka1.distribution_email_log
            ADD CONSTRAINT konditerka_distribution_email_log_status_check
            CHECK (status IN ('sent', 'skipped', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'konditerka_distribution_email_log_job_id_fkey'
          AND conrelid = 'konditerka1.distribution_email_log'::regclass
    ) THEN
        ALTER TABLE konditerka1.distribution_email_log
            ADD CONSTRAINT konditerka_distribution_email_log_job_id_fkey
            FOREIGN KEY (job_id)
            REFERENCES konditerka1.distribution_jobs(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_konditerka_email_log_business_date
    ON konditerka1.distribution_email_log (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_konditerka_email_log_job_id
    ON konditerka1.distribution_email_log (job_id);

ALTER TABLE konditerka1.distribution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE konditerka1.distribution_email_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'konditerka1'
          AND tablename = 'distribution_jobs'
          AND policyname = 'konditerka_distribution_jobs_service_role_all'
    ) THEN
        CREATE POLICY konditerka_distribution_jobs_service_role_all
            ON konditerka1.distribution_jobs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'konditerka1'
          AND tablename = 'distribution_jobs'
          AND policyname = 'konditerka_distribution_jobs_authenticated_select'
    ) THEN
        CREATE POLICY konditerka_distribution_jobs_authenticated_select
            ON konditerka1.distribution_jobs
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'konditerka1'
          AND tablename = 'distribution_email_log'
          AND policyname = 'konditerka_distribution_email_log_service_role_all'
    ) THEN
        CREATE POLICY konditerka_distribution_email_log_service_role_all
            ON konditerka1.distribution_email_log
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'konditerka1'
          AND tablename = 'distribution_email_log'
          AND policyname = 'konditerka_distribution_email_log_authenticated_select'
    ) THEN
        CREATE POLICY konditerka_distribution_email_log_authenticated_select
            ON konditerka1.distribution_email_log
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

GRANT USAGE ON SCHEMA konditerka1 TO authenticated, service_role;
GRANT SELECT ON konditerka1.distribution_jobs TO authenticated;
GRANT SELECT ON konditerka1.distribution_email_log TO authenticated;
GRANT ALL ON konditerka1.distribution_jobs TO service_role;
GRANT ALL ON konditerka1.distribution_email_log TO service_role;
