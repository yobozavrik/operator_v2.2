CREATE TABLE IF NOT EXISTS konditerka1.leftovers (
    storage_id integer NOT NULL,
    storage_name text,
    product_id integer NOT NULL,
    product_name text,
    category_name text,
    count numeric DEFAULT 0,
    unit text,
    updated_at timestamptz DEFAULT now(),
    PRIMARY KEY (storage_id, product_id)
);

CREATE OR REPLACE VIEW konditerka1.v_konditerka_distribution_stats AS
SELECT vo."код_продукту" AS product_id,
       vo."назва_продукту" AS product_name,
       vo."назва_магазину" AS spot_name,
       vo.avg_sales_day,
       vo.min_stock,
       (COALESCE(max(kl.count), (0)::numeric))::integer AS stock_now,
       COALESCE(max(prod.baked_at_factory), 0) AS baked_at_factory,
       (GREATEST((0)::numeric, ((vo.min_stock)::numeric - COALESCE(max(kl.count), (0)::numeric))))::integer AS need_net
FROM konditerka1.v_konditerka_orders vo
LEFT JOIN konditerka1.v_konditerka_production_only prod ON vo."код_продукту" = prod.product_id
LEFT JOIN categories.spots s ON s.name = vo."назва_магазину"
LEFT JOIN categories.storages st ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
LEFT JOIN konditerka1.leftovers kl ON st.storage_id = kl.storage_id AND vo."код_продукту" = kl.product_id
GROUP BY vo."код_продукту", vo."назва_продукту", vo."назва_магазину", vo.avg_sales_day, vo.min_stock;

GRANT ALL ON konditerka1.leftovers TO anon, authenticated, service_role;
