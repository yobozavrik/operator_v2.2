-- Mobile upload sessions for QR-code invoice scanning
-- Each session has a single-use token valid for 15 minutes.

CREATE TABLE IF NOT EXISTS executive.supply_mobile_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text        UNIQUE NOT NULL,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'uploaded', 'expired')),
  invoice_id  uuid        REFERENCES executive.supply_invoices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS supply_mobile_sessions_token_idx
  ON executive.supply_mobile_sessions (token);

CREATE INDEX IF NOT EXISTS supply_mobile_sessions_created_at_idx
  ON executive.supply_mobile_sessions (created_at DESC);

-- RLS
ALTER TABLE executive.supply_mobile_sessions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create sessions
CREATE POLICY "supply_mobile_sessions_insert" ON executive.supply_mobile_sessions
  FOR INSERT TO authenticated WITH CHECK (true);

-- Anyone can read a session by token (token itself is the secret)
CREATE POLICY "supply_mobile_sessions_select" ON executive.supply_mobile_sessions
  FOR SELECT USING (true);

-- Service role handles updates
CREATE POLICY "supply_mobile_sessions_update" ON executive.supply_mobile_sessions
  FOR UPDATE USING (true);
