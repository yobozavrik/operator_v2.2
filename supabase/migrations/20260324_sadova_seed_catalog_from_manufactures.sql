-- Seed Sadova catalog from real production history in categories schema.
-- Uses storage_id = 34 (Садова), 180-day window.

INSERT INTO sadova1.production_catalog (
    product_id,
    category_id,
    category_name,
    product_name,
    portion_size,
    unit,
    is_active,
    updated_at
)
SELECT
    mi.product_id::integer AS product_id,
    COALESCE(c.category_id::text, 'auto') AS category_id,
    COALESCE(c.category_name, 'Auto (from production)') AS category_name,
    MAX(mi.product_name)::text AS product_name,
    1::numeric AS portion_size,
    COALESCE(NULLIF(p.unit, ''), 'кг')::text AS unit,
    true AS is_active,
    now() AS updated_at
FROM categories.manufacture_items mi
JOIN categories.manufactures m ON m.manufacture_id = mi.manufacture_id
LEFT JOIN categories.products p ON p.id = mi.product_id
LEFT JOIN categories.categories c ON c.category_id = p.category_id
WHERE m.storage_id = 34
  AND m.manufacture_date >= (CURRENT_DATE - interval '180 days')
  AND mi.is_deleted IS NOT TRUE
  AND mi.product_id IS NOT NULL
GROUP BY mi.product_id, c.category_id, c.category_name, p.unit
ON CONFLICT (product_id) DO UPDATE
SET
    product_name = EXCLUDED.product_name,
    category_id = EXCLUDED.category_id,
    category_name = EXCLUDED.category_name,
    unit = EXCLUDED.unit,
    is_active = true,
    updated_at = now();

