-- Florida distribution: job/email tracking and daily production snapshots.
-- Safe migration: idempotent DDL only, no destructive changes.

CREATE SCHEMA IF NOT EXISTS florida1;

CREATE TABLE IF NOT EXISTS florida1.distribution_jobs (
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

ALTER TABLE florida1.distribution_jobs
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
        WHERE conname = 'distribution_jobs_trigger_type_check'
          AND conrelid = 'florida1.distribution_jobs'::regclass
    ) THEN
        ALTER TABLE florida1.distribution_jobs
            ADD CONSTRAINT distribution_jobs_trigger_type_check
            CHECK (trigger_type IN ('scheduled', 'manual'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'distribution_jobs_status_check'
          AND conrelid = 'florida1.distribution_jobs'::regclass
    ) THEN
        ALTER TABLE florida1.distribution_jobs
            ADD CONSTRAINT distribution_jobs_status_check
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

CREATE INDEX IF NOT EXISTS idx_dist_jobs_business_date
    ON florida1.distribution_jobs (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_dist_jobs_status
    ON florida1.distribution_jobs (status);
CREATE INDEX IF NOT EXISTS idx_dist_jobs_started_at
    ON florida1.distribution_jobs (started_at DESC);

CREATE TABLE IF NOT EXISTS florida1.distribution_email_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date date NOT NULL,
    job_id uuid REFERENCES florida1.distribution_jobs(id) ON DELETE SET NULL,
    recipient_email text,
    subject text,
    sent_at timestamptz,
    status text NOT NULL,
    error_message text,
    payload_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE florida1.distribution_email_log
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
        WHERE conname = 'distribution_email_log_status_check'
          AND conrelid = 'florida1.distribution_email_log'::regclass
    ) THEN
        ALTER TABLE florida1.distribution_email_log
            ADD CONSTRAINT distribution_email_log_status_check
            CHECK (status IN ('sent', 'skipped', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'distribution_email_log_job_id_fkey'
          AND conrelid = 'florida1.distribution_email_log'::regclass
    ) THEN
        ALTER TABLE florida1.distribution_email_log
            ADD CONSTRAINT distribution_email_log_job_id_fkey
            FOREIGN KEY (job_id)
            REFERENCES florida1.distribution_jobs(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_log_business_date
    ON florida1.distribution_email_log (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_job_id
    ON florida1.distribution_email_log (job_id);

CREATE TABLE IF NOT EXISTS florida1.daily_production_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date date NOT NULL,
    product_id bigint NOT NULL,
    product_name text NOT NULL,
    quantity numeric(12,3) NOT NULL DEFAULT 0,
    unit text NOT NULL DEFAULT 'кг',
    source_storage_id integer NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE florida1.daily_production_snapshots
    ADD COLUMN IF NOT EXISTS business_date date,
    ADD COLUMN IF NOT EXISTS product_id bigint,
    ADD COLUMN IF NOT EXISTS product_name text,
    ADD COLUMN IF NOT EXISTS quantity numeric(12,3) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unit text DEFAULT 'кг',
    ADD COLUMN IF NOT EXISTS source_storage_id integer,
    ADD COLUMN IF NOT EXISTS captured_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_prod_snapshots_unique
    ON florida1.daily_production_snapshots (business_date, product_id, source_storage_id);
CREATE INDEX IF NOT EXISTS idx_daily_prod_snapshots_date
    ON florida1.daily_production_snapshots (business_date DESC);

ALTER TABLE florida1.distribution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE florida1.distribution_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE florida1.daily_production_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'florida1'
          AND tablename = 'distribution_jobs'
          AND policyname = 'distribution_jobs_service_role_all'
    ) THEN
        CREATE POLICY distribution_jobs_service_role_all
            ON florida1.distribution_jobs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'florida1'
          AND tablename = 'distribution_jobs'
          AND policyname = 'distribution_jobs_authenticated_select'
    ) THEN
        CREATE POLICY distribution_jobs_authenticated_select
            ON florida1.distribution_jobs
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'florida1'
          AND tablename = 'distribution_email_log'
          AND policyname = 'distribution_email_log_service_role_all'
    ) THEN
        CREATE POLICY distribution_email_log_service_role_all
            ON florida1.distribution_email_log
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'florida1'
          AND tablename = 'distribution_email_log'
          AND policyname = 'distribution_email_log_authenticated_select'
    ) THEN
        CREATE POLICY distribution_email_log_authenticated_select
            ON florida1.distribution_email_log
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'florida1'
          AND tablename = 'daily_production_snapshots'
          AND policyname = 'daily_production_snapshots_service_role_all'
    ) THEN
        CREATE POLICY daily_production_snapshots_service_role_all
            ON florida1.daily_production_snapshots
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'florida1'
          AND tablename = 'daily_production_snapshots'
          AND policyname = 'daily_production_snapshots_authenticated_select'
    ) THEN
        CREATE POLICY daily_production_snapshots_authenticated_select
            ON florida1.daily_production_snapshots
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

GRANT USAGE ON SCHEMA florida1 TO authenticated, service_role;
GRANT SELECT ON florida1.distribution_jobs TO authenticated;
GRANT SELECT ON florida1.distribution_email_log TO authenticated;
GRANT SELECT ON florida1.daily_production_snapshots TO authenticated;
GRANT ALL ON florida1.distribution_jobs TO service_role;
GRANT ALL ON florida1.distribution_email_log TO service_role;
GRANT ALL ON florida1.daily_production_snapshots TO service_role;
