-- Bulvar Step 1: switch v_bulvar_orders min_stock formula to avg_sales_day * 3.
-- Note:
-- - Keep min_stock as INTEGER in this step to avoid breaking dependent views/functions.
-- - Decimal min_stock for kg will be introduced at the next layer (distribution stats path).

CREATE OR REPLACE VIEW bulvar1.v_bulvar_orders AS
WITH bulvar_products AS (
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(NULLIF(bcp.unit, ''), 'шт') AS catalog_unit
    FROM categories.products p
    LEFT JOIN bulvar1.production_180d_products bcp
      ON bcp.product_id = p.id
    WHERE p.category_id::text = ANY (
        ARRAY[
            '30', -- Страви від шефа
            '29', -- Хачапурі
            '10', -- Млинці
            '11', -- Котлети
            '14', -- Деруни
            '12', -- Сирники
            '40', -- Готові страви
            '8'   -- Хінкалі
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
sales_14_days AS (
    SELECT
        t.spot_id,
        ti.product_id,
        SUM(
            CASE
                WHEN bp.catalog_unit = 'шт'
                    THEN COALESCE(ti.num, 0::numeric)
                ELSE COALESCE(ti.num, 0::numeric) / 1000.0
            END
        ) / 14.0 AS avg_14d
    FROM categories.transactions t
    JOIN categories.transaction_items ti
      ON t.transaction_id = ti.transaction_id
    JOIN bulvar_products bp
      ON bp.product_id = ti.product_id
    WHERE t.date_close >= (CURRENT_DATE - INTERVAL '14 days')
      AND t.date_close < CURRENT_DATE
    GROUP BY t.spot_id, ti.product_id
)
SELECT
    m.spot_name AS "назва_магазину",
    bp.product_name AS "назва_продукту",
    bp.product_id AS "код_продукту",
    ROUND(COALESCE(s14.avg_14d, 0::numeric), 3) AS avg_sales_day,
    CEIL(COALESCE(s14.avg_14d, 0::numeric) * 3)::integer AS min_stock
FROM shop_to_storage m
CROSS JOIN bulvar_products bp
LEFT JOIN sales_14_days s14
  ON m.spot_id = s14.spot_id
 AND bp.product_id = s14.product_id;
