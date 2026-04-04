BEGIN;

CREATE OR REPLACE FUNCTION konditerka1.refresh_production_180d_products(
    p_product_ids integer[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, konditerka1, categories
AS $function$
BEGIN
    INSERT INTO konditerka1.production_180d_products (
        product_id,
        product_name,
        category_id,
        category_name,
        source_storage_id,
        refreshed_at,
        updated_at
    )
    WITH scoped_products AS (
        SELECT
            p.id::integer AS product_id,
            p.name::text AS product_name,
            p.category_id::integer AS category_id,
            c.category_name::text AS category_name
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
    )
    SELECT
        sp.product_id,
        MAX(sp.product_name) AS product_name,
        MAX(sp.category_id) AS category_id,
        MAX(sp.category_name) AS category_name,
        48 AS source_storage_id,
        now() AS refreshed_at,
        now() AS updated_at
    FROM categories.manufacture_items mi
    JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
    JOIN scoped_products sp ON sp.product_id = mi.product_id
    WHERE m.storage_id = 48
      AND m.manufacture_date >= (CURRENT_DATE - interval '180 days')
      AND mi.is_deleted IS NOT TRUE
      AND (p_product_ids IS NULL OR mi.product_id = ANY(p_product_ids))
    GROUP BY sp.product_id
    ON CONFLICT (product_id) DO UPDATE
    SET
        product_name = EXCLUDED.product_name,
        category_id = EXCLUDED.category_id,
        category_name = EXCLUDED.category_name,
        source_storage_id = EXCLUDED.source_storage_id,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO konditerka1.production_180d_products (
        product_id,
        product_name,
        category_id,
        category_name,
        source_storage_id,
        refreshed_at,
        updated_at
    )
    WITH scoped_products AS (
        SELECT
            p.id::integer AS product_id,
            p.name::text AS product_name,
            p.category_id::integer AS category_id,
            c.category_name::text AS category_name
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
    )
    SELECT
        sp.product_id,
        MAX(sp.product_name) AS product_name,
        MAX(sp.category_id) AS category_id,
        MAX(sp.category_name) AS category_name,
        48 AS source_storage_id,
        now() AS refreshed_at,
        now() AS updated_at
    FROM konditerka1.leftovers l
    JOIN scoped_products sp ON sp.product_id = l.product_id
    WHERE l.product_id IS NOT NULL
      AND l.product_name IS NOT NULL
      AND (p_product_ids IS NULL OR l.product_id = ANY(p_product_ids))
    GROUP BY sp.product_id
    ON CONFLICT (product_id) DO UPDATE
    SET
        product_name = EXCLUDED.product_name,
        category_id = EXCLUDED.category_id,
        category_name = EXCLUDED.category_name,
        source_storage_id = EXCLUDED.source_storage_id,
        refreshed_at = EXCLUDED.refreshed_at,
        updated_at = EXCLUDED.updated_at;

    WITH scoped_products AS (
        SELECT p.id::integer AS product_id
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
    )
    DELETE FROM konditerka1.production_180d_products target
    WHERE (p_product_ids IS NULL OR target.product_id = ANY(p_product_ids))
      AND target.category_id IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM scoped_products sp
          WHERE sp.product_id = target.product_id
      );
END;
$function$;

WITH scoped_products AS (
    SELECT p.id::integer AS product_id
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
)
DELETE FROM konditerka1.production_180d_products target
WHERE target.category_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM scoped_products sp
      WHERE sp.product_id = target.product_id
  );

COMMIT;
