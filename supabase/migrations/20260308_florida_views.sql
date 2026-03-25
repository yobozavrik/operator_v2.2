-- Script to create Florida views in the florida1 schema
-- Please execute this inside the Supabase SQL Editor.

CREATE SCHEMA IF NOT EXISTS florida1;

CREATE TABLE IF NOT EXISTS florida1.effective_stocks (
    storage_id integer NOT NULL,
    ingredient_id bigint,
    ingredient_name text NOT NULL,
    ingredient_name_normalized text NOT NULL,
    stock_left numeric(14,3) NOT NULL DEFAULT 0,
    unit text,
    source text NOT NULL DEFAULT 'poster_live',
    spot_id integer,
    spot_name text,
    snapshot_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (storage_id, ingredient_name_normalized)
);

-- 1. Orders View
CREATE OR REPLACE VIEW florida1.v_florida_orders AS
WITH florida_products AS (
    SELECT p.id AS product_id,
           p.name AS product_name
    FROM categories.products p
    JOIN categories.categories c ON p.category_id = c.category_id
    WHERE c.category_name IN (
        'Вареники', 'Верховода', 'Голубці', 'Готові страви', 'Деруни', 
        'Зрази', 'Ковбаси', 'Котлети', 'Млинці', 'Моті', 'Пельмені', 
        'Перець фарширований', 'ПИРІЖЕЧКИ', 'Сирники', 'Страви від шефа', 
        'Хачапурі', 'Хінкалі', 'Чебуреки'
    )
), shop_to_storage AS (
    SELECT s.spot_id,
           s.name AS spot_name,
           st.storage_id
    FROM categories.spots s
    JOIN categories.storages st ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
    WHERE s.name NOT ILIKE '%test%'::text AND s.name NOT ILIKE '%тест%'::text
), sales_14_days AS (
    SELECT t.spot_id,
           ti.product_id,
           (sum(COALESCE(ti.num, (0)::numeric)) / 14.0) AS avg_14d
    FROM categories.transactions t
    JOIN categories.transaction_items ti ON t.transaction_id = ti.transaction_id
    WHERE t.date_close >= (CURRENT_DATE - INTERVAL '14 days') 
      AND t.date_close < CURRENT_DATE
    GROUP BY t.spot_id, ti.product_id
)
SELECT m.spot_name AS "назва_магазину",
       p.product_name AS "назва_продукту",
       p.product_id AS "код_продукту",
       round(COALESCE(s14.avg_14d, (0)::numeric), 2) AS avg_sales_day,
       (ceil((COALESCE(s14.avg_14d, (0)::numeric) * 1.5)))::integer AS min_stock
FROM shop_to_storage m
CROSS JOIN florida_products p
LEFT JOIN sales_14_days s14 ON m.spot_id = s14.spot_id AND p.product_id = s14.product_id;


-- 2. Production Only View
CREATE OR REPLACE VIEW florida1.v_florida_production_only AS
SELECT mi.product_id,
       mi.product_name,
       (sum(mi.quantity))::integer AS baked_at_factory,
       max(m.manufacture_date) AS last_update
FROM categories.manufacture_items mi
JOIN categories.manufactures m ON mi.manufacture_id = m.manufacture_id
-- We MUST filter by florida products here so we don't grab pizza/konditerka production
JOIN categories.products p ON mi.product_id = p.id
JOIN categories.categories c ON p.category_id = c.category_id
WHERE m.storage_id = 41 AND m.manufacture_date >= CURRENT_DATE AND mi.is_deleted IS NOT TRUE
  AND c.category_name IN (
        'Вареники', 'Верховода', 'Голубці', 'Готові страви', 'Деруни', 
        'Зрази', 'Ковбаси', 'Котлети', 'Млинці', 'Моті', 'Пельмені', 
        'Перець фарширований', 'ПИРІЖЕЧКИ', 'Сирники', 'Страви від шефа', 
        'Хачапурі', 'Хінкалі', 'Чебуреки'
    )
GROUP BY mi.product_id, mi.product_name;


-- 3. Distribution Stats View
CREATE OR REPLACE VIEW florida1.v_florida_distribution_stats AS
SELECT vo."код_продукту" AS product_id,
       vo."назва_продукту" AS product_name,
       vo."назва_магазину" AS spot_name,
       vo.avg_sales_day,
       vo.min_stock,
       (COALESCE(max(ves.stock_left), (0)::numeric))::integer AS stock_now,
       COALESCE(max(prod.baked_at_factory), 0) AS baked_at_factory,
       (GREATEST((0)::numeric, ((vo.min_stock)::numeric - COALESCE(max(ves.stock_left), (0)::numeric))))::integer AS need_net
FROM florida1.v_florida_orders vo
LEFT JOIN florida1.v_florida_production_only prod ON vo."код_продукту" = prod.product_id
LEFT JOIN categories.spots s ON s.name = vo."назва_магазину"
LEFT JOIN categories.storages st ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
LEFT JOIN florida1.effective_stocks ves ON st.storage_id = ves.storage_id AND ves.ingredient_name_normalized = regexp_replace(lower(TRIM(BOTH FROM vo."назва_продукту")), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
WHERE vo."назва_продукту" NOT ILIKE '%пакет%' 
  AND vo."назва_продукту" NOT ILIKE '%соус%'
  AND vo."назва_продукту" NOT ILIKE '%коробка%'
GROUP BY vo."код_продукту", vo."назва_продукту", vo."назва_магазину", vo.avg_sales_day, vo.min_stock;


-- 4. GRANT PERMISSIONS
GRANT USAGE ON SCHEMA florida1 TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA florida1 TO anon, authenticated, service_role;
