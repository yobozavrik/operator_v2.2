CREATE UNIQUE INDEX IF NOT EXISTS idx_pizza_customer_reservations_one_draft
    ON pizza1.customer_reservations (reservation_date, customer_name)
    WHERE status = 'draft';
