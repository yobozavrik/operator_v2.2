-- Konditerka leftovers mapping and operational read model.
-- This migration reflects the current owner-layer state:
-- - catalog products are whitelisted
-- - leftovers are raw facts
-- - stock is mapped by product_leftovers_map
-- - daily distribution is store-only

BEGIN;

CREATE TABLE IF NOT EXISTS konditerka1.product_leftovers_map (
    product_id integer NOT NULL,
    ingredient_id integer NOT NULL,
    product_name text NOT NULL,
    ingredient_name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_leftovers_map_pkey
    ON konditerka1.product_leftovers_map USING btree (product_id);

CREATE UNIQUE INDEX IF NOT EXISTS product_leftovers_map_ingredient_id_key
    ON konditerka1.product_leftovers_map USING btree (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_konditerka_product_leftovers_map_active
    ON konditerka1.product_leftovers_map USING btree (active, product_id, ingredient_id);

CREATE OR REPLACE FUNCTION konditerka1.refresh_konditerka_product_leftovers_map()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'konditerka1', 'categories'
AS $function$
BEGIN
    DROP TABLE IF EXISTS tmp_konditerka_product_leftovers_map;

    CREATE TEMP TABLE tmp_konditerka_product_leftovers_map ON COMMIT DROP AS
    WITH catalog_products AS (
        SELECT
            p.product_id::integer AS product_id,
            p.product_name::text AS product_name,
            konditerka1.normalize_konditerka_key(p.product_name) AS product_key
        FROM konditerka1.production_180d_products p
        WHERE p.product_id IS NOT NULL
          AND p.category_id IS NOT NULL
          AND p.product_name IS NOT NULL
    ),
    leftover_candidates AS (
        SELECT DISTINCT ON (konditerka1.normalize_konditerka_key(l.product_name))
            l.product_id::integer AS ingredient_id,
            l.product_name::text AS ingredient_name,
            konditerka1.normalize_konditerka_key(l.product_name) AS ingredient_key
        FROM konditerka1.leftovers l
        WHERE l.product_id IS NOT NULL
          AND l.product_name IS NOT NULL
        ORDER BY konditerka1.normalize_konditerka_key(l.product_name), l.updated_at DESC, l.product_id ASC
    ),
    matched AS (
        SELECT DISTINCT ON (c.product_id)
            c.product_id,
            c.product_name,
            lc.ingredient_id,
            lc.ingredient_name
        FROM catalog_products c
        JOIN leftover_candidates lc
          ON lc.ingredient_key = c.product_key
        ORDER BY c.product_id, lc.ingredient_id
    )
    SELECT
        product_id,
        product_name,
        ingredient_id,
        ingredient_name
    FROM matched;

    INSERT INTO konditerka1.product_leftovers_map (
        product_id,
        ingredient_id,
        product_name,
        ingredient_name,
        active,
        created_at,
        updated_at
    )
    SELECT
        product_id,
        ingredient_id,
        product_name,
        ingredient_name,
        true,
        now(),
        now()
    FROM tmp_konditerka_product_leftovers_map
    ON CONFLICT (product_id) DO UPDATE
    SET ingredient_id = EXCLUDED.ingredient_id,
        product_name = EXCLUDED.product_name,
        ingredient_name = EXCLUDED.ingredient_name,
        active = true,
        updated_at = now();

    UPDATE konditerka1.product_leftovers_map map
    SET active = false,
        updated_at = now()
    WHERE NOT EXISTS (
        SELECT 1
        FROM konditerka1.production_180d_products p
        WHERE p.product_id = map.product_id
          AND p.category_id IS NOT NULL
    )
       OR NOT EXISTS (
        SELECT 1
        FROM tmp_konditerka_product_leftovers_map tmp
        WHERE tmp.product_id = map.product_id
    );
END;
$function$;

CREATE OR REPLACE VIEW konditerka1.v_konditerka_orders AS
 WITH konditerka_products AS (
         SELECT p_1.id AS product_id,
            p_1.name AS product_name
           FROM categories.products p_1
             JOIN categories.categories c ON p_1.category_id = c.category_id
          WHERE c.category_name ~~* '%кондите%'::text OR c.category_name ~~* '%десерт%'::text OR c.category_name ~~* '%солодк%'::text OR c.category_name ~~* '%морозив%'::text OR c.category_name ~~* '%моті%'::text OR c.category_name ~~* '%пиріжеч%'::text OR c.category_name ~~* '%сирник%'::text OR c.category_name ~~* '%торти%'::text
        ), shop_to_storage AS (
         SELECT s.spot_id,
            s.name AS spot_name,
            st.storage_id
           FROM categories.spots s
             JOIN categories.storages st ON regexp_replace(lower(s.name), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text) = regexp_replace(replace(lower(st.storage_name), 'магазин'::text, ''::text), '[^а-яіїєґa-z0-9]'::text, ''::text, 'g'::text)
          WHERE s.name !~~* '%test%'::text AND s.name !~~* '%тест%'::text
        ), sales_14_days AS (
         SELECT t.spot_id,
            ti.product_id,
            sum(COALESCE(ti.num, 0::numeric)) / 14.0 AS avg_14d
           FROM categories.transactions t
             JOIN categories.transaction_items ti ON t.transaction_id = ti.transaction_id
             CROSS JOIN ( SELECT (now() AT TIME ZONE 'Europe/Kyiv'::text)::date AS kyiv_today) p_1
          WHERE t.date_close >= (p_1.kyiv_today - '14 days'::interval) AND t.date_close < p_1.kyiv_today
          GROUP BY t.spot_id, ti.product_id
        )
 SELECT m.spot_name AS "назва_магазину",
    p.product_name AS "назва_продукту",
    p.product_id AS "код_продукту",
    round(COALESCE(s14.avg_14d, 0::numeric), 2) AS avg_sales_day,
    ceil(COALESCE(s14.avg_14d, 0::numeric) * 1.5)::integer AS min_stock
   FROM shop_to_storage m
     CROSS JOIN konditerka_products p
     LEFT JOIN sales_14_days s14 ON m.spot_id = s14.spot_id AND p.product_id = s14.product_id;

CREATE OR REPLACE VIEW konditerka1.v_konditerka_distribution_stats AS
 WITH shop_to_storage AS (
         SELECT s.spot_id,
            s.name AS spot_name,
            st.storage_id
           FROM categories.spots s
             JOIN categories.storages st ON konditerka1.normalize_konditerka_key(s.name) = konditerka1.normalize_konditerka_key(replace(lower(st.storage_name), 'магазин'::text, ''::text))
          WHERE s.name !~~* '%test%'::text AND s.name !~~* '%тест%'::text
        ), legacy_orders AS (
         SELECT vo."код_продукту"::integer AS product_id,
            vo."назва_продукту" AS product_name,
            vo."назва_магазину" AS spot_name,
            COALESCE(vo.avg_sales_day, 0::numeric) AS avg_sales_day,
            COALESCE(vo.min_stock, 0)::numeric AS min_stock
           FROM konditerka1.v_konditerka_orders vo
        ), catalog_products AS (
         SELECT DISTINCT p.product_id,
            max(p.product_name) AS product_name
           FROM konditerka1.production_180d_products p
          WHERE p.product_id IS NOT NULL AND p.category_id IS NOT NULL
          GROUP BY p.product_id
        ), sales_14_days AS (
         SELECT t.spot_id,
            ti.product_id,
            sum(COALESCE(ti.num, 0::numeric)) / 14.0 AS avg_14d
           FROM categories.transactions t
             JOIN categories.transaction_items ti ON ti.transaction_id = t.transaction_id
             CROSS JOIN ( SELECT (now() AT TIME ZONE 'Europe/Kyiv'::text)::date AS kyiv_today) p
          WHERE t.date_close >= (p.kyiv_today - '14 days'::interval) AND t.date_close < p.kyiv_today
          GROUP BY t.spot_id, ti.product_id
        ), rows_base AS (
         SELECT cp.product_id,
            cp.product_name,
            ss.spot_id,
            ss.spot_name,
            ss.storage_id,
            COALESCE(s14.avg_14d, lo.avg_sales_day, 0::numeric) AS avg_sales_day_raw,
            GREATEST(COALESCE(lo.min_stock, 0::numeric), ceil(COALESCE(s14.avg_14d, lo.avg_sales_day, 0::numeric) * 1.5)) AS min_stock_raw
           FROM catalog_products cp
             CROSS JOIN shop_to_storage ss
             LEFT JOIN sales_14_days s14 ON s14.spot_id = ss.spot_id AND s14.product_id = cp.product_id
             LEFT JOIN legacy_orders lo ON lo.product_id = cp.product_id AND lo.spot_name = ss.spot_name
        )
 SELECT rb.product_id::bigint AS product_id,
    rb.product_name,
    rb.spot_name,
    round(rb.avg_sales_day_raw, 3) AS avg_sales_day,
    GREATEST(0::numeric, round(rb.min_stock_raw, 0))::integer AS min_stock,
    COALESCE(max(l.count), 0::numeric)::integer AS stock_now,
    COALESCE(max(prod.baked_at_factory), 0) AS baked_at_factory,
    GREATEST(0, GREATEST(0::numeric, round(rb.min_stock_raw, 0))::integer - COALESCE(max(l.count), 0::numeric)::integer) AS need_net,
    rb.spot_id,
    rb.storage_id
   FROM rows_base rb
     LEFT JOIN konditerka1.product_leftovers_map map ON map.product_id = rb.product_id AND map.active = true
     LEFT JOIN konditerka1.leftovers l ON l.storage_id = rb.storage_id AND l.product_id = map.ingredient_id
     LEFT JOIN konditerka1.v_konditerka_production_only prod ON prod.product_id = rb.product_id
  GROUP BY rb.product_id, rb.product_name, rb.spot_name, rb.avg_sales_day_raw, rb.min_stock_raw, rb.spot_id, rb.storage_id;

CREATE OR REPLACE VIEW konditerka1.v_konditerka_production_only AS
 SELECT mi.product_id,
    mi.product_name,
    round(sum(mi.quantity), 0)::integer AS baked_at_factory,
    max(m.manufacture_date) AS last_update
   FROM categories.manufacture_items mi
     JOIN categories.manufactures m ON mi.manufacture_id = m.manufacture_id
     JOIN categories.products p ON mi.product_id = p.id
     JOIN categories.categories c ON p.category_id = c.category_id
     CROSS JOIN ( SELECT (now() AT TIME ZONE 'Europe/Kyiv'::text)::date AS kyiv_today) d
  WHERE m.storage_id = 48 AND m.manufacture_date >= d.kyiv_today AND mi.is_deleted IS NOT TRUE AND (c.category_name ~~* '%кондите%'::text OR c.category_name ~~* '%десерт%'::text OR c.category_name ~~* '%солодк%'::text OR c.category_name ~~* '%морозив%'::text OR c.category_name ~~* '%моті%'::text OR c.category_name ~~* '%пиріжеч%'::text OR c.category_name ~~* '%сирник%'::text OR c.category_name ~~* '%торти%'::text)
  GROUP BY mi.product_id, mi.product_name;

GRANT SELECT ON TABLE konditerka1.product_leftovers_map TO anon, authenticated, service_role;
GRANT SELECT ON VIEW konditerka1.v_konditerka_orders TO anon, authenticated, service_role;
GRANT SELECT ON VIEW konditerka1.v_konditerka_distribution_stats TO anon, authenticated, service_role;
GRANT SELECT ON VIEW konditerka1.v_konditerka_production_only TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION konditerka1.refresh_konditerka_product_leftovers_map() TO authenticated, service_role;

COMMIT;
