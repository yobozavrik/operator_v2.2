-- 1. Create Snapshot Tables

CREATE TABLE IF NOT EXISTS graviton.distribution_input_stocks (
    id bigserial,
    batch_id uuid not null,
    business_date date not null,
    spot_id integer not null,
    storage_id integer not null,
    product_id bigint,
    product_name text not null,
    product_name_normalized text not null,
    ingredient_id integer,
    ingredient_name text,
    stock_left numeric not null,
    unit text,
    source text not null default 'poster_live',
    created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_graviton_dist_stocks_batch ON graviton.distribution_input_stocks(batch_id);
CREATE INDEX IF NOT EXISTS idx_graviton_dist_stocks_batch_spot ON graviton.distribution_input_stocks(batch_id, spot_id, product_name_normalized);
CREATE INDEX IF NOT EXISTS idx_graviton_dist_stocks_batch_storage ON graviton.distribution_input_stocks(batch_id, storage_id, product_name_normalized);

CREATE TABLE IF NOT EXISTS graviton.distribution_input_production (
    id bigserial,
    batch_id uuid not null,
    business_date date not null,
    storage_id integer not null,
    product_id bigint,
    product_name text not null,
    product_name_normalized text not null,
    quantity numeric not null,
    source text not null default 'poster_live',
    created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_graviton_dist_prod_batch ON graviton.distribution_input_production(batch_id);
CREATE INDEX IF NOT EXISTS idx_graviton_dist_prod_batch_storage ON graviton.distribution_input_production(batch_id, storage_id, product_name_normalized);

CREATE TABLE IF NOT EXISTS graviton.distribution_run_meta (
    batch_id uuid primary key,
    business_date date not null,
    selected_shop_ids integer[],
    full_run boolean not null,
    stocks_rows integer not null default 0,
    manufactures_rows integer not null default 0,
    partial_sync boolean not null default false,
    failed_storages integer[],
    created_at timestamptz not null default now()
);

-- 2. Create Distribution Function v4

CREATE OR REPLACE FUNCTION graviton.fn_run_distribution_v4(
    p_product_id integer,
    p_batch_id uuid,
    p_business_date date,
    p_shop_ids integer[] DEFAULT NULL::integer[],
    p_allow_warehouse_row boolean DEFAULT true
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '300s'
AS $function$
DECLARE
    v_pool integer;
    v_product_name text;
    v_norm_name text;
    v_zeros_count integer;
    v_total_need numeric;
    v_multiplier integer := 2;
    v_k numeric;
    v_remainder integer;
    v_effective_shop_ids integer[];
BEGIN
    -- Resolve target shops.
    IF p_shop_ids IS NULL THEN
        SELECT array_agg(DISTINCT "код_магазину" ORDER BY "код_магазину")
        INTO v_effective_shop_ids
        FROM graviton.distribution_base
        WHERE "код_продукту" = p_product_id;
    ELSE
        v_effective_shop_ids := p_shop_ids;
    END IF;

    IF v_effective_shop_ids IS NULL OR array_length(v_effective_shop_ids, 1) IS NULL THEN
        RETURN;
    END IF;
    
    -- Get Product Name and Normalized Name from catalog
    SELECT product_name, lower(regexp_replace(product_name, '\s+', ' ', 'g'))
    INTO v_product_name, v_norm_name
    FROM graviton.production_catalog
    WHERE product_id = p_product_id
    LIMIT 1;

    -- Get available production pool from snapshot
    SELECT FLOOR(COALESCE(SUM(quantity), 0))::integer
    INTO v_pool
    FROM graviton.distribution_input_production
    WHERE batch_id = p_batch_id
      AND product_name_normalized = v_norm_name;

    IF v_pool IS NULL OR v_pool <= 0 THEN
        RETURN;
    END IF;

    DROP TABLE IF EXISTS temp_calc_g;

    -- Create temp table bringing historical configs from distribution_base and live stock from snapshots
    CREATE TEMP TABLE temp_calc_g AS
    SELECT
        b."код_магазину"::integer AS spot_id,
        b."назва_магазину"::text AS spot_name,
        COALESCE(b."avg_sales_day", 0)::numeric AS avg_sales_day,
        COALESCE(b."min_stock", 0)::integer AS min_stock,
        GREATEST(0, COALESCE(s.total_stock_left, 0))::numeric AS effective_stock,
        0::integer AS final_qty,
        0::numeric AS temp_need
    FROM graviton.distribution_base b
    LEFT JOIN (
        SELECT spot_id, SUM(stock_left) AS total_stock_left
        FROM graviton.distribution_input_stocks
        WHERE batch_id = p_batch_id
          AND product_name_normalized = v_norm_name
        GROUP BY spot_id
    ) s ON s.spot_id = b."код_магазину"
    WHERE b."код_продукту" = p_product_id
      AND b."код_магазину" = ANY(v_effective_shop_ids);

    IF NOT EXISTS (SELECT 1 FROM temp_calc_g) THEN
        RETURN;
    END IF;

    -- =====================================================
    -- Stage 1: zero-stock stores
    -- =====================================================
    SELECT COUNT(*)
    INTO v_zeros_count
    FROM temp_calc_g
    WHERE effective_stock = 0;

    IF v_zeros_count > 0 THEN
        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc_g
            SET final_qty = 1
            WHERE spot_name IN (
                SELECT spot_name
                FROM temp_calc_g
                WHERE effective_stock = 0
                ORDER BY avg_sales_day DESC, spot_name ASC
                LIMIT v_pool
            );
            v_pool := 0;
        ELSE
            UPDATE temp_calc_g
            SET final_qty = 1
            WHERE effective_stock = 0;

            v_pool := v_pool - v_zeros_count;
        END IF;
    END IF;

    -- =====================================================
    -- Stage 2: bring stores up to min_stock
    -- =====================================================
    IF v_pool > 0 THEN
        UPDATE temp_calc_g
        SET temp_need = GREATEST(0, min_stock - (effective_stock + final_qty))
        WHERE true;

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_g;

        IF v_total_need > 0 THEN
            IF v_pool < v_total_need THEN
                v_k := v_pool::numeric / v_total_need::numeric;

                UPDATE temp_calc_g
                SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
                WHERE temp_need > 0;

                SELECT GREATEST(
                    v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                    0
                )
                INTO v_remainder
                FROM temp_calc_g
                WHERE temp_need > 0;

                IF v_remainder > 0 THEN
                    UPDATE temp_calc_g
                    SET final_qty = final_qty + 1
                    WHERE spot_name IN (
                        SELECT spot_name
                        FROM temp_calc_g
                        WHERE temp_need > 0
                        ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                        LIMIT v_remainder
                    );
                END IF;

                v_pool := 0;
            ELSE
                UPDATE temp_calc_g
                SET final_qty = final_qty + temp_need::integer
                WHERE temp_need > 0;

                v_pool := v_pool - v_total_need::integer;
            END IF;
        END IF;
    END IF;

    -- =====================================================
    -- Stage 3: top-up, but never above 4 * min_stock
    -- =====================================================
    WHILE v_pool > 0 AND v_multiplier <= 4 LOOP
        UPDATE temp_calc_g
        SET temp_need = GREATEST(
            0,
            (min_stock * v_multiplier) - (effective_stock + final_qty)
        )
        WHERE true;

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_g;

        EXIT WHEN v_total_need <= 0;

        IF v_pool < v_total_need THEN
            v_k := v_pool::numeric / v_total_need::numeric;

            UPDATE temp_calc_g
            SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
            WHERE temp_need > 0;

            SELECT GREATEST(
                v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                0
            )
            INTO v_remainder
            FROM temp_calc_g
            WHERE temp_need > 0;

            IF v_remainder > 0 THEN
                UPDATE temp_calc_g
                SET final_qty = final_qty + 1
                WHERE spot_name IN (
                    SELECT spot_name
                    FROM temp_calc_g
                    WHERE temp_need > 0
                    ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                    LIMIT v_remainder
                );
            END IF;

            v_pool := 0;
        ELSE
            UPDATE temp_calc_g
            SET final_qty = final_qty + temp_need::integer
            WHERE temp_need > 0;

            v_pool := v_pool - v_total_need::integer;
            v_multiplier := v_multiplier + 1;
        END IF;
    END LOOP;

    -- =====================================================
    -- Save shop rows (USING distribution_results contract exactly)
    -- =====================================================
    INSERT INTO graviton.distribution_results (
        product_id,
        product_name,
        spot_name,
        quantity_to_ship,
        calculation_batch_id,
        business_date,
        delivery_status
    )
    SELECT
        p_product_id,
        v_product_name,
        spot_name,
        final_qty,
        p_batch_id,
        p_business_date,
        'pending'
    FROM temp_calc_g
    WHERE final_qty > 0;

    -- Save warehouse remainder only for full runs.
    IF p_allow_warehouse_row AND v_pool > 0 THEN
        INSERT INTO graviton.distribution_results (
            product_id,
            product_name,
            spot_name,
            quantity_to_ship,
            calculation_batch_id,
            business_date,
            delivery_status
        )
        VALUES (
            p_product_id,
            v_product_name,
            'Остаток на Складе',
            v_pool,
            p_batch_id,
            p_business_date,
            'delivered'
        );
    END IF;
END;
$function$;


-- 3. Create Live Orchestrator

CREATE OR REPLACE FUNCTION graviton.fn_orchestrate_distribution_live(
    p_batch_id uuid,
    p_business_date date,
    p_shop_ids integer[] DEFAULT NULL::integer[]
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '300s'
AS $function$
DECLARE
    v_product_id integer;
    v_log_id uuid;
    v_count integer := 0;
    v_total_kg numeric := 0;
    v_effective_shop_ids integer[];
    v_is_partial boolean := false;
BEGIN
    -- 1. Resolve shops exactly to log and iterate
    IF p_shop_ids IS NULL THEN
        v_effective_shop_ids := NULL;
        v_is_partial := false;
    ELSE
        SELECT array_agg(x.shop_id ORDER BY x.shop_id)
        INTO v_effective_shop_ids
        FROM (
            SELECT DISTINCT s.spot_id AS shop_id
            FROM graviton.distribution_shops s
            WHERE s.is_active = true
              AND s.spot_id = ANY(p_shop_ids)
        ) x;

        IF v_effective_shop_ids IS NULL OR array_length(v_effective_shop_ids, 1) IS NULL THEN
            RAISE EXCEPTION 'No active Graviton shops matched the requested p_shop_ids';
        END IF;

        v_is_partial := true;
    END IF;

    -- 2. Add to distribution_logs (Audit Trail)
    INSERT INTO graviton.distribution_logs (
        batch_id,
        business_date,
        status,
        shop_ids_selected,
        started_at
    )
    VALUES (
        p_batch_id,
        p_business_date,
        'running',
        v_effective_shop_ids,
        now()
    )
    RETURNING id INTO v_log_id;

    -- 3. Delete old results cleanly
    IF v_is_partial THEN
        DELETE FROM graviton.distribution_results dr
        WHERE dr.business_date = p_business_date
          AND dr.spot_name IN (
              SELECT DISTINCT "назва_магазину"
              FROM graviton.distribution_base
              WHERE "код_магазину" = ANY(v_effective_shop_ids)
          );
    ELSE
        DELETE FROM graviton.distribution_results
        WHERE business_date = p_business_date;
    END IF;

    -- 4. Loop over active production from snapshot and trigger v4 calc
    FOR v_product_id IN 
        SELECT DISTINCT product_id 
        FROM graviton.distribution_input_production 
        WHERE batch_id = p_batch_id AND quantity > 0
    LOOP
        BEGIN
            PERFORM graviton.fn_run_distribution_v4(
                p_product_id := v_product_id,
                p_batch_id := p_batch_id,
                p_business_date := p_business_date,
                p_shop_ids := v_effective_shop_ids,
                p_allow_warehouse_row := NOT v_is_partial
            );
            
            v_count := v_count + 1;
        EXCEPTION
            WHEN OTHERS THEN
                UPDATE graviton.distribution_logs
                SET error_message = COALESCE(error_message, '') ||
                    'Product ' || v_product_id || ': ' || SQLERRM || '; '
                WHERE id = v_log_id;
        END;
    END LOOP;

    -- 5. Calculate total_kg and finalize
    SELECT COALESCE(SUM(quantity_to_ship), 0)
    INTO v_total_kg
    FROM graviton.distribution_results
    WHERE calculation_batch_id = p_batch_id;

    UPDATE graviton.distribution_logs
    SET
        status = 'success',
        completed_at = now(),
        products_count = v_count,
        total_kg = v_total_kg
    WHERE id = v_log_id;
    
EXCEPTION
    WHEN OTHERS THEN
        UPDATE graviton.distribution_logs
        SET
            status = 'failed',
            completed_at = now(),
            error_message = SQLERRM
        WHERE id = v_log_id;
        RAISE;
END;
$function$;

-- 6. Grants for frontend access
GRANT USAGE ON SCHEMA graviton TO anon, authenticated;
GRANT SELECT ON graviton.distribution_input_stocks TO anon, authenticated;
GRANT SELECT ON graviton.distribution_input_production TO anon, authenticated;
GRANT SELECT ON graviton.distribution_run_meta TO anon, authenticated;
GRANT SELECT ON graviton.distribution_base TO anon, authenticated;
GRANT SELECT ON graviton.distribution_results TO anon, authenticated;
