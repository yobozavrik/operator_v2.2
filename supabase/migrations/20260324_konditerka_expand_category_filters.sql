-- Konditerka: expand category filter so products like "Моті", "Сирники", "Пиріжечки", "Торти"
-- are included in orders/production views and can be distributed to stores.

CREATE OR REPLACE VIEW konditerka1.v_konditerka_orders AS
WITH konditerka_products AS (
    SELECT
        p.id AS product_id,
        p.name AS product_name
    FROM categories.products p
    JOIN categories.categories c
      ON p.category_id = c.category_id
    WHERE
        c.category_name ILIKE '%кондите%'
        OR c.category_name ILIKE '%десерт%'
        OR c.category_name ILIKE '%солодк%'
        OR c.category_name ILIKE '%морозив%'
        OR c.category_name ILIKE '%моті%'
        OR c.category_name ILIKE '%пиріжеч%'
        OR c.category_name ILIKE '%сирник%'
        OR c.category_name ILIKE '%торти%'
),
shop_to_storage AS (
    SELECT
        s.spot_id,
        s.name AS spot_name,
        st.storage_id
    FROM categories.spots s
    JOIN categories.storages st
      ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
       = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
    WHERE
        s.name NOT ILIKE '%test%'
        AND s.name NOT ILIKE '%тест%'
),
sales_14_days AS (
    SELECT
        t.spot_id,
        ti.product_id,
        (SUM(COALESCE(ti.num, 0::numeric)) / 14.0) AS avg_14d
    FROM categories.transactions t
    JOIN categories.transaction_items ti
      ON t.transaction_id = ti.transaction_id
    WHERE
        t.date_close >= (CURRENT_DATE - INTERVAL '14 days')
        AND t.date_close < CURRENT_DATE
    GROUP BY t.spot_id, ti.product_id
)
SELECT
    m.spot_name AS "назва_магазину",
    p.product_name AS "назва_продукту",
    p.product_id AS "код_продукту",
    ROUND(COALESCE(s14.avg_14d, 0::numeric), 2) AS avg_sales_day,
    CEIL(COALESCE(s14.avg_14d, 0::numeric) * 1.5)::integer AS min_stock
FROM shop_to_storage m
CROSS JOIN konditerka_products p
LEFT JOIN sales_14_days s14
  ON m.spot_id = s14.spot_id
 AND p.product_id = s14.product_id;


CREATE OR REPLACE VIEW konditerka1.v_konditerka_production_only AS
SELECT
    mi.product_id,
    mi.product_name,
    SUM(mi.quantity)::integer AS baked_at_factory,
    MAX(m.manufacture_date) AS last_update
FROM categories.manufacture_items mi
JOIN categories.manufactures m
  ON mi.manufacture_id = m.manufacture_id
JOIN categories.products p
  ON mi.product_id = p.id
JOIN categories.categories c
  ON p.category_id = c.category_id
WHERE
    m.storage_id = 48
    AND m.manufacture_date >= CURRENT_DATE
    AND mi.is_deleted IS NOT TRUE
    AND (
        c.category_name ILIKE '%кондите%'
        OR c.category_name ILIKE '%десерт%'
        OR c.category_name ILIKE '%солодк%'
        OR c.category_name ILIKE '%морозив%'
        OR c.category_name ILIKE '%моті%'
        OR c.category_name ILIKE '%пиріжеч%'
        OR c.category_name ILIKE '%сирник%'
        OR c.category_name ILIKE '%торти%'
    )
GROUP BY mi.product_id, mi.product_name;

GRANT SELECT ON TABLE konditerka1.v_konditerka_orders TO anon, authenticated, service_role;
GRANT SELECT ON TABLE konditerka1.v_konditerka_production_only TO anon, authenticated, service_role;

