CREATE OR REPLACE VIEW florida1.v_florida_orders AS
WITH florida_products AS (
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(NULLIF(p180.unit, ''), 'шт') AS catalog_unit
    FROM categories.products p
    LEFT JOIN florida1.production_180d_products p180
      ON p180.product_id = p.id
    WHERE p180.product_id IS NOT NULL
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
sales_14_days AS (
    SELECT
        t.spot_id,
        ti.product_id,
        SUM(
            CASE
                WHEN fp.catalog_unit = 'шт'
                    THEN COALESCE(ti.num, 0::numeric)
                ELSE COALESCE(ti.num, 0::numeric) / 1000.0
            END
        ) / 14.0 AS avg_14d
    FROM categories.transactions t
    JOIN categories.transaction_items ti
      ON t.transaction_id = ti.transaction_id
    JOIN florida_products fp
      ON fp.product_id = ti.product_id
    WHERE t.date_close >= (CURRENT_DATE - INTERVAL '14 days')
      AND t.date_close < CURRENT_DATE
    GROUP BY t.spot_id, ti.product_id
)
SELECT
    m.spot_name AS "назва_магазину",
    fp.product_name AS "назва_продукту",
    fp.product_id AS "код_продукту",
    ROUND(COALESCE(s14.avg_14d, 0::numeric), 2) AS avg_sales_day,
    CEIL(COALESCE(s14.avg_14d, 0::numeric) * 1.5)::integer AS min_stock
FROM shop_to_storage m
CROSS JOIN florida_products fp
LEFT JOIN sales_14_days s14
  ON m.spot_id = s14.spot_id
 AND fp.product_id = s14.product_id;
