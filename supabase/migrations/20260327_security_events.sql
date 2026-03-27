-- Security events table for structured logging and anomaly detection.
-- Written to by security-logger.ts (service_role) — readable by owner role for dashboards.

CREATE TABLE IF NOT EXISTS public.security_events (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    text        NOT NULL,   -- AUTH_FAILURE | FORBIDDEN | CORS_VIOLATION | API_ERROR_4XX | API_ERROR_5XX | SUSPICIOUS_ACTIVITY
    severity      text        NOT NULL,   -- low | medium | high | critical
    ip_address    text,
    user_id       uuid,
    path          text,
    method        text,
    status_code   integer,
    user_agent    text,
    metadata      jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for anomaly detection queries (per-IP, per-event-type, recent window)
CREATE INDEX IF NOT EXISTS security_events_ip_type_time
    ON public.security_events (ip_address, event_type, created_at DESC);

-- Index for dashboards (recent events by type/severity)
CREATE INDEX IF NOT EXISTS security_events_type_time
    ON public.security_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS security_events_severity_time
    ON public.security_events (severity, created_at DESC);

-- Partition-friendly: drop old events after 90 days to keep the table lean
-- (run manually or via pg_cron if available on your Supabase plan)
-- DELETE FROM public.security_events WHERE created_at < now() - interval '90 days';

-- RLS: service_role bypasses RLS (used for writes); authenticated owner role can read
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all"
    ON public.security_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Owner can read all security events (for dashboard/monitoring)
CREATE POLICY "owner_read_security_events"
    ON public.security_events
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
        OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'owner'
    );

-- Convenient view for SUSPICIOUS_ACTIVITY alerts in the last 24h
CREATE OR REPLACE VIEW public.security_alerts_24h AS
SELECT
    ip_address,
    event_type,
    severity,
    count(*)          AS event_count,
    max(created_at)   AS last_seen,
    min(created_at)   AS first_seen
FROM public.security_events
WHERE created_at >= now() - interval '24 hours'
  AND severity IN ('high', 'critical')
GROUP BY ip_address, event_type, severity
ORDER BY last_seen DESC;
