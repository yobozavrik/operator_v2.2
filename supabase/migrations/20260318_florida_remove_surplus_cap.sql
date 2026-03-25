-- Remove surplus cap (min_stock * 4) in Florida 3-stage distribution.
-- This makes stage 4 continue until pool is fully distributed
-- (except pathological cases where all computed temp_need are zero).

CREATE OR REPLACE FUNCTION florida1.fn_run_distribution_3stage(
    p_product_id integer,
    p_batch_id uuid DEFAULT gen_random_uuid(),
    p_business_date date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv'::text))::date,
    p_allow_warehouse_row boolean DEFAULT true,
    p_surplus_multiplier_max integer DEFAULT 4
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
    v_spots_count integer;
    v_multiplier integer := 2;
    v_k numeric;
BEGIN
    SELECT
        FLOOR(COALESCE(SUM(baked_at_factory), 0))::integer,
        MAX(product_name)
    INTO v_pool, v_product_name
    FROM florida1.v_florida_production_only
    WHERE product_id = p_product_id;

    IF v_pool IS NULL OR v_pool <= 0 OR v_product_name IS NULL THEN
        RETURN;
    END IF;

    DROP TABLE IF EXISTS temp_calc_f;

    CREATE TEMP TABLE temp_calc_f ON COMMIT DROP AS
    SELECT
        spot_id::integer AS spot_id,
        spot_name::text AS spot_name,
        COALESCE(avg_sales_day, 0)::numeric AS avg_sales_day,
        COALESCE(min_stock, 0)::integer AS min_stock,
        GREATEST(0::numeric, COALESCE(stock_now, 0))::numeric AS effective_stock,
        0::integer AS final_qty,
        0::numeric AS temp_need
    FROM florida1.v_florida_distribution_stats
    WHERE product_id::integer = p_product_id;

    IF NOT EXISTS (SELECT 1 FROM temp_calc_f) THEN
        RETURN;
    END IF;

    SELECT COUNT(*)
    INTO v_zeros_count
    FROM temp_calc_f
    WHERE effective_stock <= 0;

    IF v_zeros_count > 0 THEN
        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc_f
            SET final_qty = 1
            WHERE spot_id IN (
                SELECT spot_id
                FROM temp_calc_f
                WHERE effective_stock <= 0
                ORDER BY avg_sales_day DESC, spot_name ASC
                LIMIT v_pool
            );
            v_pool := 0;
        ELSE
            UPDATE temp_calc_f
            SET final_qty = 1
            WHERE effective_stock <= 0;
            v_pool := v_pool - v_zeros_count;
        END IF;
    END IF;

    IF v_pool > 0 THEN
        UPDATE temp_calc_f
        SET temp_need = GREATEST(0, min_stock - (effective_stock + final_qty));

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_f;

        IF v_total_need > 0 THEN
            IF v_pool < v_total_need THEN
                v_k := v_pool::numeric / v_total_need::numeric;

                UPDATE temp_calc_f
                SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
                WHERE temp_need > 0;

                SELECT GREATEST(
                    v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                    0
                )
                INTO v_remainder
                FROM temp_calc_f
                WHERE temp_need > 0;

                IF v_remainder > 0 THEN
                    UPDATE temp_calc_f
                    SET final_qty = final_qty + 1
                    WHERE spot_id IN (
                        SELECT spot_id
                        FROM temp_calc_f
                        WHERE temp_need > 0
                        ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                        LIMIT v_remainder
                    );
                END IF;

                v_pool := 0;
            ELSE
                UPDATE temp_calc_f
                SET final_qty = final_qty + temp_need::integer
                WHERE temp_need > 0;
                v_pool := v_pool - v_total_need::integer;
            END IF;
        END IF;
    END IF;

    -- Stage 4: no hard cap by multiplier anymore.
    -- If there is still pool but no computed need, force round-robin
    -- so production is distributed to 0 (no warehouse remainder).
    WHILE v_pool > 0 LOOP
        UPDATE temp_calc_f
        SET temp_need = GREATEST(
            0,
            (min_stock * v_multiplier) - (effective_stock + final_qty)
        );

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_f;

        IF v_total_need <= 0 THEN
            SELECT COUNT(*)::integer
            INTO v_spots_count
            FROM temp_calc_f;

            EXIT WHEN v_spots_count <= 0;

            UPDATE temp_calc_f
            SET final_qty = final_qty + (v_pool / v_spots_count);

            v_remainder := MOD(v_pool, v_spots_count);

            IF v_remainder > 0 THEN
                UPDATE temp_calc_f
                SET final_qty = final_qty + 1
                WHERE spot_id IN (
                    SELECT spot_id
                    FROM temp_calc_f
                    ORDER BY avg_sales_day DESC, spot_name ASC
                    LIMIT v_remainder
                );
            END IF;

            v_pool := 0;
            EXIT;
        END IF;

        IF v_pool < v_total_need THEN
            v_k := v_pool::numeric / v_total_need::numeric;

            UPDATE temp_calc_f
            SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
            WHERE temp_need > 0;

            SELECT GREATEST(
                v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                0
            )
            INTO v_remainder
            FROM temp_calc_f
            WHERE temp_need > 0;

            IF v_remainder > 0 THEN
                UPDATE temp_calc_f
                SET final_qty = final_qty + 1
                WHERE spot_id IN (
                    SELECT spot_id
                    FROM temp_calc_f
                    WHERE temp_need > 0
                    ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                    LIMIT v_remainder
                );
            END IF;

            v_pool := 0;
        ELSE
            UPDATE temp_calc_f
            SET final_qty = final_qty + temp_need::integer
            WHERE temp_need > 0;
            v_pool := v_pool - v_total_need::integer;
            v_multiplier := v_multiplier + 1;
        END IF;
    END LOOP;

    INSERT INTO florida1.distribution_results (
        product_id,
        product_name,
        spot_id,
        spot_name,
        quantity_to_ship,
        calculation_batch_id,
        business_date,
        delivery_status
    )
    SELECT
        p_product_id,
        v_product_name,
        spot_id,
        spot_name,
        final_qty,
        p_batch_id,
        p_business_date,
        'pending'
    FROM temp_calc_f
    WHERE final_qty > 0;

    IF p_allow_warehouse_row AND v_pool > 0 THEN
        INSERT INTO florida1.distribution_results (
            product_id,
            product_name,
            spot_id,
            spot_name,
            quantity_to_ship,
            calculation_batch_id,
            business_date,
            delivery_status
        )
        VALUES (
            p_product_id,
            v_product_name,
            NULL,
            'Остаток на Складе',
            v_pool,
            p_batch_id,
            p_business_date,
            'delivered'
        );
    END IF;
END;
$function$;
