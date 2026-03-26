ALTER TABLE pizza1.customer_reservations
    ADD COLUMN IF NOT EXISTS previous_reservation_id uuid REFERENCES pizza1.customer_reservations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1;

ALTER TABLE pizza1.customer_reservations
    DROP CONSTRAINT IF EXISTS pizza_customer_reservations_status_check;

ALTER TABLE pizza1.customer_reservations
    ADD CONSTRAINT pizza_customer_reservations_status_check
    CHECK (status IN ('draft', 'confirmed', 'used_in_distribution', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_pizza_customer_reservations_previous
    ON pizza1.customer_reservations (previous_reservation_id);
