-- Seed active Sadova distribution shops.
-- Requested shops:
-- - Садова
-- - Герцена
-- - Київ
-- - Шкільна
-- - Роша

WITH target_spots AS (
    SELECT s.spot_id, s.name AS spot_name
    FROM categories.spots s
    WHERE s.name IN ('Садова', 'Герцена', 'Київ', 'Шкільна', 'Роша')
),
target_pairs AS (
    SELECT
        ts.spot_id,
        st.storage_id
    FROM target_spots ts
    JOIN categories.storages st
      ON regexp_replace(lower(ts.spot_name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
       = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
)
INSERT INTO sadova1.distribution_shops (spot_id, storage_id, is_active, updated_at)
SELECT
    tp.spot_id,
    tp.storage_id,
    true AS is_active,
    now() AS updated_at
FROM target_pairs tp
ON CONFLICT (spot_id) DO UPDATE
SET
    storage_id = EXCLUDED.storage_id,
    is_active = true,
    updated_at = now();

UPDATE sadova1.distribution_shops ds
SET
    is_active = false,
    updated_at = now()
WHERE ds.spot_id NOT IN (
    SELECT ts.spot_id
    FROM categories.spots ts
    WHERE ts.name IN ('Садова', 'Герцена', 'Київ', 'Шкільна', 'Роша')
);
