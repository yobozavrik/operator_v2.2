-- RLS policies for pizza1.customer_reservations and pizza1.customer_reservation_items
-- Defense-in-depth: API layer already enforces ownership via service_role + auth guard,
-- but authenticated role should also be restricted at DB level.

-- Enable RLS on both tables
ALTER TABLE pizza1.customer_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza1.customer_reservation_items ENABLE ROW LEVEL SECURITY;

-- ─── customer_reservations ────────────────────────────────────────────────────

-- Owner: full access to all reservations
CREATE POLICY "owner_all_reservations"
    ON pizza1.customer_reservations
    FOR ALL
    TO authenticated
    USING (
        auth.jwt() ->> 'email' = ANY(
            string_to_array(current_setting('app.owner_emails', true), ',')
        )
        OR auth.uid()::text = ANY(
            string_to_array(current_setting('app.owner_user_ids', true), ',')
        )
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
        OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'owner'
    )
    WITH CHECK (true);

-- Regular users: can only see and modify their own reservations
CREATE POLICY "creator_own_reservations"
    ON pizza1.customer_reservations
    FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ─── customer_reservation_items ──────────────────────────────────────────────

-- Owner: full access to all items
CREATE POLICY "owner_all_reservation_items"
    ON pizza1.customer_reservation_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pizza1.customer_reservations r
            WHERE r.id = reservation_id
            AND (
                (auth.jwt() -> 'app_metadata' ->> 'role') = 'owner'
                OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'owner'
                OR auth.jwt() ->> 'email' = ANY(
                    string_to_array(current_setting('app.owner_emails', true), ',')
                )
                OR auth.uid()::text = ANY(
                    string_to_array(current_setting('app.owner_user_ids', true), ',')
                )
            )
        )
    )
    WITH CHECK (true);

-- Regular users: can only access items belonging to their own reservations
CREATE POLICY "creator_own_reservation_items"
    ON pizza1.customer_reservation_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pizza1.customer_reservations r
            WHERE r.id = reservation_id
            AND r.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pizza1.customer_reservations r
            WHERE r.id = reservation_id
            AND r.created_by = auth.uid()
        )
    );
