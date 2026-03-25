-- Bulvar UOM hotfix for product_id=625 ("Суп з індички").
-- Problem: auto UOM detection classifies product 625 as grams and divides sales by 1000,
-- which collapses avg_sales_day/min_stock to ~0 in cards.

CREATE OR REPLACE VIEW bulvar1.v_bulvar_orders AS
WITH bulvar_products AS (
    SELECT
        p.id AS product_id,
        p.name AS product_name
    FROM categories.products p
    WHERE p.category_id::text = ANY (
        ARRAY[
            '30', -- chef dishes
            '29', -- khachapuri
            '10', -- crepes
            '11', -- cutlets
            '14', -- deruny
            '12', -- syrnyky
            '40', -- ready meals
            '8'   -- khinkali
        ]
    )
),
shop_to_storage AS (
    SELECT
        s.spot_id,
        s.name AS spot_name,
        st.storage_id
    FROM categories.spots s
    JOIN categories.storages st
      ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
       = regexp_replace(
            replace(lower(st.storage_name), 'магазин'::text, ''::text),
            '[^а-яіїєґa-z0-9]'::text,
            ''::text,
            'g'::text
         )
    WHERE s.name !~~* '%test%'::text
      AND s.name !~~* '%тест%'::text
),
product_uom_mode AS (
    SELECT
        p.product_id,
        CASE
            WHEN p.product_id = 625 THEN 'pieces'
            WHEN percentile_disc(0.9) WITHIN GROUP (ORDER BY ti.num) <= 10 THEN 'pieces'
            ELSE 'grams'
        END AS uom_mode
    FROM bulvar_products p
    LEFT JOIN categories.transaction_items ti
      ON ti.product_id = p.product_id
    LEFT JOIN categories.transactions t
      ON t.transaction_id = ti.transaction_id
     AND t.date_close >= (CURRENT_DATE - INTERVAL '180 days')
     AND t.date_close < CURRENT_DATE
    GROUP BY p.product_id
),
sales_14_days AS (
    SELECT
        t.spot_id,
        ti.product_id,
        SUM(
            CASE
                WHEN COALESCE(pum.uom_mode, 'grams') = 'pieces'
                    THEN COALESCE(ti.num, 0::numeric)
                ELSE COALESCE(ti.num, 0::numeric) / 1000.0
            END
        ) / 14.0 AS avg_14d
    FROM categories.transactions t
    JOIN categories.transaction_items ti
      ON t.transaction_id = ti.transaction_id
    JOIN bulvar_products p
      ON p.product_id = ti.product_id
    LEFT JOIN product_uom_mode pum
      ON pum.product_id = ti.product_id
    WHERE t.date_close >= (CURRENT_DATE - INTERVAL '14 days')
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
CROSS JOIN bulvar_products p
LEFT JOIN sales_14_days s14
  ON m.spot_id = s14.spot_id
 AND p.product_id = s14.product_id;

