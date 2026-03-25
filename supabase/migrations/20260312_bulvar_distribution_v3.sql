CREATE OR REPLACE FUNCTION bulvar1.fn_run_distribution_v3(
    p_product_id integer,
    p_batch_id uuid DEFAULT gen_random_uuid(),
    p_business_date date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date,
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
    v_zeros_count integer;
    v_total_need numeric;
    v_remainder integer;
    v_multiplier integer := 2;
    v_k numeric;
BEGIN
    SELECT
        FLOOR(COALESCE(SUM(baked_at_factory), 0))::integer,
        MAX(product_name)
    INTO v_pool, v_product_name
    FROM bulvar1.v_bulvar_production_only
    WHERE product_id = p_product_id;

    IF v_pool IS NULL OR v_pool <= 0 OR v_product_name IS NULL THEN
        RETURN;
    END IF;

    DROP TABLE IF EXISTS temp_calc_b;

    CREATE TEMP TABLE temp_calc_b ON COMMIT DROP AS
    SELECT
        spot_name::text AS spot_name,
        COALESCE(avg_sales_day, 0)::numeric AS avg_sales_day,
        COALESCE(min_stock, 0)::integer AS min_stock,
        GREATEST(0, COALESCE(stock_now, 0))::numeric AS effective_stock,
        0::integer AS final_qty,
        0::numeric AS temp_need
    FROM bulvar1.v_bulvar_distribution_stats
    WHERE product_id = p_product_id;

    IF NOT EXISTS (SELECT 1 FROM temp_calc_b) THEN
        RETURN;
    END IF;

    -- Stage 1: zero-stock stores
    SELECT COUNT(*)
    INTO v_zeros_count
    FROM temp_calc_b
    WHERE effective_stock = 0;

    IF v_zeros_count > 0 THEN
        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc_b
            SET final_qty = 1
            WHERE spot_name IN (
                SELECT spot_name
                FROM temp_calc_b
                WHERE effective_stock = 0
                ORDER BY avg_sales_day DESC, spot_name ASC
                LIMIT v_pool
            );
            v_pool := 0;
        ELSE
            UPDATE temp_calc_b
            SET final_qty = 1
            WHERE effective_stock = 0;

            v_pool := v_pool - v_zeros_count;
        END IF;
    END IF;

    -- Stage 2: bring to min_stock
    IF v_pool > 0 THEN
        UPDATE temp_calc_b
        SET temp_need = GREATEST(0, min_stock - (effective_stock + final_qty))
        WHERE true;

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_b;

        IF v_total_need > 0 THEN
            IF v_pool < v_total_need THEN
                v_k := v_pool::numeric / v_total_need::numeric;

                UPDATE temp_calc_b
                SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
                WHERE temp_need > 0;

                SELECT GREATEST(
                    v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                    0
                )
                INTO v_remainder
                FROM temp_calc_b
                WHERE temp_need > 0;

                IF v_remainder > 0 THEN
                    UPDATE temp_calc_b
                    SET final_qty = final_qty + 1
                    WHERE spot_name IN (
                        SELECT spot_name
                        FROM temp_calc_b
                        WHERE temp_need > 0
                        ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                        LIMIT v_remainder
                    );
                END IF;

                v_pool := 0;
            ELSE
                UPDATE temp_calc_b
                SET final_qty = final_qty + temp_need::integer
                WHERE temp_need > 0;

                v_pool := v_pool - v_total_need::integer;
            END IF;
        END IF;
    END IF;

    -- Stage 3: top-up, but never above 4 * min_stock
    WHILE v_pool > 0 AND v_multiplier <= 4 LOOP
        UPDATE temp_calc_b
        SET temp_need = GREATEST(
            0,
            (min_stock * v_multiplier) - (effective_stock + final_qty)
        )
        WHERE true;

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_b;

        EXIT WHEN v_total_need <= 0;

        IF v_pool < v_total_need THEN
            v_k := v_pool::numeric / v_total_need::numeric;

            UPDATE temp_calc_b
            SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
            WHERE temp_need > 0;

            SELECT GREATEST(
                v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                0
            )
            INTO v_remainder
            FROM temp_calc_b
            WHERE temp_need > 0;

            IF v_remainder > 0 THEN
                UPDATE temp_calc_b
                SET final_qty = final_qty + 1
                WHERE spot_name IN (
                    SELECT spot_name
                    FROM temp_calc_b
                    WHERE temp_need > 0
                    ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                    LIMIT v_remainder
                );
            END IF;

            v_pool := 0;
        ELSE
            UPDATE temp_calc_b
            SET final_qty = final_qty + temp_need::integer
            WHERE temp_need > 0;

            v_pool := v_pool - v_total_need::integer;
            v_multiplier := v_multiplier + 1;
        END IF;
    END LOOP;

    INSERT INTO bulvar1.distribution_results (
        product_name,
        spot_name,
        quantity_to_ship,
        calculation_batch_id,
        business_date,
        delivery_status
    )
    SELECT
        v_product_name,
        spot_name,
        final_qty,
        p_batch_id,
        p_business_date,
        'pending'
    FROM temp_calc_b
    WHERE final_qty > 0;

    IF p_allow_warehouse_row AND v_pool > 0 THEN
        INSERT INTO bulvar1.distribution_results (
            product_name,
            spot_name,
            quantity_to_ship,
            calculation_batch_id,
            business_date,
            delivery_status
        )
        VALUES (
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

CREATE OR REPLACE FUNCTION bulvar1.fn_full_recalculate_all()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $function$
DECLARE
    r record;
    v_batch_id uuid := gen_random_uuid();
    v_business_date date := (now() AT TIME ZONE 'Europe/Kyiv')::date;
BEGIN
    DELETE FROM bulvar1.distribution_results
    WHERE business_date = v_business_date;

    FOR r IN
        SELECT DISTINCT product_id
        FROM bulvar1.v_bulvar_production_only
        WHERE baked_at_factory > 0
        ORDER BY product_id
    LOOP
        PERFORM bulvar1.fn_run_distribution_v3(
            p_product_id := r.product_id,
            p_batch_id := v_batch_id,
            p_business_date := v_business_date,
            p_allow_warehouse_row := true
        );
    END LOOP;

    RETURN v_batch_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION bulvar1.fn_run_distribution_v3(integer, uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION bulvar1.fn_run_distribution_v3(integer, uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION bulvar1.fn_full_recalculate_all() TO authenticated;
GRANT EXECUTE ON FUNCTION bulvar1.fn_full_recalculate_all() TO service_role;
