-- Добавляем 'skipped' в допустимые значения delivery_status
ALTER TABLE graviton.distribution_results
    DROP CONSTRAINT chk_delivery_status;

ALTER TABLE graviton.distribution_results
    ADD CONSTRAINT chk_delivery_status
    CHECK (delivery_status = ANY (ARRAY['pending'::text, 'delivered'::text, 'skipped'::text]));
