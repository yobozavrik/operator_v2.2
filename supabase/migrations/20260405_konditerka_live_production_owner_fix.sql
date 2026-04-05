BEGIN;

CREATE OR REPLACE VIEW konditerka1.v_konditerka_production_only AS
WITH category_scope AS (
    SELECT
        p.id::integer AS product_id,
        p.name::text AS product_name
    FROM categories.products p
    JOIN categories.categories c ON c.category_id = p.category_id
    WHERE c.category_name ILIKE '%кондите%'
       OR c.category_name ILIKE '%десерт%'
       OR c.category_name ILIKE '%солодк%'
       OR c.category_name ILIKE '%морозив%'
       OR c.category_name ILIKE '%моті%'
       OR c.category_name ILIKE '%пиріжеч%'
       OR c.category_name ILIKE '%сирник%'
       OR c.category_name ILIKE '%торти%'
),
live_poster_today AS (
    SELECT
        mi.product_id::integer AS product_id,
        MAX(mi.product_name)::text AS product_name,
        ROUND(SUM(mi.quantity), 0)::integer AS baked_at_factory,
        MAX((COALESCE(m.synced_at, mi.updated_at) AT TIME ZONE 'Europe/Kyiv')) AS last_update,
        1 AS source_priority
    FROM konditerka1.manufacture_items mi
    JOIN konditerka1.manufactures m ON m.manufacture_id = mi.manufacture_id
    JOIN category_scope scope ON scope.product_id = mi.product_id
    CROSS JOIN (
        SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date AS kyiv_today
    ) d
    WHERE m.storage_id = 48
      AND m.business_date = d.kyiv_today
      AND m.source = 'poster_live'
    GROUP BY mi.product_id
),
categories_today AS (
    SELECT
        mi.product_id::integer AS product_id,
        MAX(mi.product_name)::text AS product_name,
        ROUND(SUM(mi.quantity), 0)::integer AS baked_at_factory,
        MAX(m.manufacture_date) AS last_update,
        2 AS source_priority
    FROM categories.manufacture_items mi
    JOIN categories.manufactures m ON mi.manufacture_id = m.manufacture_id
    JOIN category_scope scope ON scope.product_id = mi.product_id
    CROSS JOIN (
        SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date AS kyiv_today
    ) d
    WHERE m.storage_id = 48
      AND m.manufacture_date >= d.kyiv_today
      AND mi.is_deleted IS NOT TRUE
    GROUP BY mi.product_id
),
combined AS (
    SELECT * FROM live_poster_today
    UNION ALL
    SELECT * FROM categories_today
)
SELECT DISTINCT ON (combined.product_id)
    combined.product_id,
    combined.product_name,
    combined.baked_at_factory,
    combined.last_update
FROM combined
WHERE combined.baked_at_factory > 0
ORDER BY
    combined.product_id,
    combined.source_priority ASC,
    combined.last_update DESC;

GRANT SELECT ON TABLE konditerka1.v_konditerka_production_only TO anon, authenticated, service_role;

COMMIT;
