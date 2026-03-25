-- Build and refresh sadova1.distribution_base from real sales.
-- Uses active Sadova shops + active Sadova catalog products.

CREATE OR REPLACE FUNCTION sadova1.refresh_distribution_base(
    p_days integer DEFAULT 14,
    p_min_stock_multiplier numeric DEFAULT 1.5,
    p_product_ids integer[] DEFAULT NULL
)
RETURNS TABLE (
    affected_rows integer,
    spots_count integer,
    products_count integer,
    sales_days integer,
    min_stock_multiplier numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sadova1, categories
AS $function$
DECLARE
    v_days integer := GREATEST(1, COALESCE(p_days, 14));
    v_multiplier numeric := GREATEST(0, COALESCE(p_min_stock_multiplier, 1.5));
    v_rows integer := 0;
    v_spots integer := 0;
    v_products integer := 0;
BEGIN
    WITH active_shops AS (
        SELECT
            ds.spot_id::integer AS spot_id,
            s.name::text AS spot_name
        FROM sadova1.distribution_shops ds
        JOIN categories.spots s ON s.spot_id = ds.spot_id
        WHERE ds.is_active = true
    ),
    active_products AS (
        SELECT
            pc.product_id::integer AS product_id,
            pc.product_name::text AS product_name
        FROM sadova1.production_catalog pc
        WHERE pc.is_active = true
          AND (p_product_ids IS NULL OR pc.product_id = ANY(p_product_ids))
    ),
    sales AS (
        SELECT
            t.spot_id::integer AS spot_id,
            ti.product_id::integer AS product_id,
            (SUM(COALESCE(ti.num, 0)::numeric) / v_days::numeric) AS avg_sales_day
        FROM categories.transactions t
        JOIN categories.transaction_items ti ON ti.transaction_id = t.transaction_id
        JOIN active_shops sh ON sh.spot_id = t.spot_id
        JOIN active_products pr ON pr.product_id = ti.product_id
        WHERE t.date_close >= (CURRENT_DATE - make_interval(days => v_days))
          AND t.date_close < CURRENT_DATE
        GROUP BY t.spot_id, ti.product_id
    ),
    rows_to_upsert AS (
        SELECT
            pr.product_id,
            pr.product_name,
            sh.spot_id,
            sh.spot_name,
            COALESCE(sa.avg_sales_day, 0)::numeric(14,3) AS avg_sales_day,
            CEIL(COALESCE(sa.avg_sales_day, 0) * v_multiplier)::integer AS min_stock,
            0::numeric(14,3) AS current_stock,
            now() AS updated_at
        FROM active_products pr
        CROSS JOIN active_shops sh
        LEFT JOIN sales sa ON sa.product_id = pr.product_id AND sa.spot_id = sh.spot_id
    ),
    upserted AS (
        INSERT INTO sadova1.distribution_base (
            product_id,
            product_name,
            spot_id,
            spot_name,
            avg_sales_day,
            min_stock,
            current_stock,
            updated_at
        )
        SELECT
            r.product_id,
            r.product_name,
            r.spot_id,
            r.spot_name,
            r.avg_sales_day,
            r.min_stock,
            r.current_stock,
            r.updated_at
        FROM rows_to_upsert r
        ON CONFLICT (product_id, spot_id) DO UPDATE
        SET
            product_name = EXCLUDED.product_name,
            spot_name = EXCLUDED.spot_name,
            avg_sales_day = EXCLUDED.avg_sales_day,
            min_stock = EXCLUDED.min_stock,
            current_stock = EXCLUDED.current_stock,
            updated_at = EXCLUDED.updated_at
        RETURNING 1
    )
    SELECT
        COALESCE((SELECT COUNT(*) FROM upserted), 0),
        COALESCE((SELECT COUNT(*) FROM active_shops), 0),
        COALESCE((SELECT COUNT(*) FROM active_products), 0)
    INTO v_rows, v_spots, v_products;

    RETURN QUERY
    SELECT v_rows, v_spots, v_products, v_days, v_multiplier;
END;
$function$;

GRANT EXECUTE ON FUNCTION sadova1.refresh_distribution_base(integer, numeric, integer[]) TO authenticated, service_role;

-- Initial full refresh for current active Sadova setup.
SELECT * FROM sadova1.refresh_distribution_base(14, 1.5, NULL);

