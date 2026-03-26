-- Patch: align customer_reservations schema with intended design
-- 1. Make created_by nullable (system/service calls may not have a user id)
-- 2. Add check constraint to prevent empty customer_name

ALTER TABLE pizza1.customer_reservations
    ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE pizza1.customer_reservations
    ADD CONSTRAINT pizza_customer_reservations_customer_name_check
    CHECK (char_length(trim(customer_name)) > 0);
