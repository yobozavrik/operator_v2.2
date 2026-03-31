-- Таблица для хранения данных о производстве цеха Гравітон за день
CREATE TABLE IF NOT EXISTS graviton.production_daily (
    business_date           DATE          NOT NULL,
    storage_id              INT           NOT NULL DEFAULT 2,
    product_name_normalized TEXT          NOT NULL,
    product_name            TEXT          NOT NULL,
    quantity_kg             NUMERIC(10,3) NOT NULL DEFAULT 0,
    synced_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (business_date, storage_id, product_name_normalized)
);

COMMENT ON TABLE graviton.production_daily IS
    'Кеш даних Poster про вироблені за день продукти цеху Гравітон (storage_id=2)';

-- Index for date+storage lookups
CREATE INDEX IF NOT EXISTS idx_production_daily_date_storage
    ON graviton.production_daily (business_date, storage_id);
