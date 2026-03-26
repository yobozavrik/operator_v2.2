ALTER TABLE pizza1.customer_reservations
    ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE pizza1.customer_reservations
    DROP CONSTRAINT IF EXISTS pizza_customer_reservations_customer_name_check;

ALTER TABLE pizza1.customer_reservations
    ADD CONSTRAINT pizza_customer_reservations_customer_name_check
    CHECK (char_length(trim(customer_name)) > 0);
