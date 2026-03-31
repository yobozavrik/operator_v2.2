-- Track what was actually applied when a customer reservation is used in distribution.
-- applied_result is set by the server after fn_apply_customer_reservation() runs.
-- Shape: { customer_name: text, items: [{ sku, requested_qty, applied_qty, missing_qty }] }

ALTER TABLE pizza1.customer_reservations
    ADD COLUMN IF NOT EXISTS applied_result jsonb;
