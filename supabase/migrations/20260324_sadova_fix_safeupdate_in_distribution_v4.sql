-- Fix safeupdate errors in sadova1.fn_run_distribution_v4
-- Error was: "UPDATE requires a WHERE clause"
-- Root cause: temp table UPDATE statements without WHERE.

CREATE OR REPLACE FUNCTION sadova1.fn_run_distribution_v4(
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
    IF p_shop_ids IS NULL THEN
        SELECT array_agg(DISTINCT b.spot_id ORDER BY b.spot_id)
        INTO v_effective_shop_ids
        FROM sadova1.distribution_base b
        WHERE b.product_id = p_product_id;
    ELSE
        v_effective_shop_ids := p_shop_ids;
    END IF;

    IF v_effective_shop_ids IS NULL OR array_length(v_effective_shop_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    SELECT c.product_name, lower(regexp_replace(c.product_name, '\s+', ' ', 'g'))
    INTO v_product_name, v_norm_name
    FROM sadova1.production_catalog c
    WHERE c.product_id = p_product_id
    LIMIT 1;

    IF v_product_name IS NULL THEN
        SELECT MAX(ip.product_name), MAX(ip.product_name_normalized)
        INTO v_product_name, v_norm_name
        FROM sadova1.distribution_input_production ip
        WHERE ip.batch_id = p_batch_id
          AND ip.product_id = p_product_id;
    END IF;

    SELECT FLOOR(COALESCE(SUM(ip.quantity), 0))::integer
    INTO v_pool
    FROM sadova1.distribution_input_production ip
    WHERE ip.batch_id = p_batch_id
      AND (
        ip.product_id = p_product_id
        OR (ip.product_id IS NULL AND ip.product_name_normalized = v_norm_name)
      );

    IF v_pool IS NULL OR v_pool <= 0 THEN
        RETURN;
    END IF;

    DROP TABLE IF EXISTS temp_calc_sadova;

    CREATE TEMP TABLE temp_calc_sadova ON COMMIT DROP AS
    SELECT
        b.spot_id::integer AS spot_id,
        b.spot_name::text AS spot_name,
        COALESCE(b.avg_sales_day, 0)::numeric AS avg_sales_day,
        COALESCE(b.min_stock, 0)::integer AS min_stock,
        GREATEST(0, COALESCE(s.total_stock_left, 0))::numeric AS effective_stock,
        0::integer AS final_qty,
        0::numeric AS temp_need
    FROM sadova1.distribution_base b
    LEFT JOIN (
        SELECT i.spot_id, SUM(i.stock_left) AS total_stock_left
        FROM sadova1.distribution_input_stocks i
        WHERE i.batch_id = p_batch_id
          AND (
            i.product_id = p_product_id
            OR (i.product_id IS NULL AND i.product_name_normalized = v_norm_name)
          )
        GROUP BY i.spot_id
    ) s ON s.spot_id = b.spot_id
    WHERE b.product_id = p_product_id
      AND b.spot_id = ANY(v_effective_shop_ids);

    IF NOT EXISTS (SELECT 1 FROM temp_calc_sadova) THEN
        RETURN;
    END IF;

    SELECT COUNT(*)
    INTO v_zeros_count
    FROM temp_calc_sadova
    WHERE effective_stock = 0;

    IF v_zeros_count > 0 THEN
        IF v_pool <= v_zeros_count THEN
            UPDATE temp_calc_sadova
            SET final_qty = 1
            WHERE spot_id IN (
                SELECT spot_id
                FROM temp_calc_sadova
                WHERE effective_stock = 0
                ORDER BY avg_sales_day DESC, spot_name ASC
                LIMIT v_pool
            );
            v_pool := 0;
        ELSE
            UPDATE temp_calc_sadova
            SET final_qty = 1
            WHERE effective_stock = 0;

            v_pool := v_pool - v_zeros_count;
        END IF;
    END IF;

    IF v_pool > 0 THEN
        UPDATE temp_calc_sadova
        SET temp_need = GREATEST(0, min_stock - (effective_stock + final_qty))
        WHERE TRUE;

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_sadova;

        IF v_total_need > 0 THEN
            IF v_pool < v_total_need THEN
                v_k := v_pool::numeric / v_total_need::numeric;

                UPDATE temp_calc_sadova
                SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
                WHERE temp_need > 0;

                SELECT GREATEST(
                    v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                    0
                )
                INTO v_remainder
                FROM temp_calc_sadova
                WHERE temp_need > 0;

                IF v_remainder > 0 THEN
                    UPDATE temp_calc_sadova
                    SET final_qty = final_qty + 1
                    WHERE spot_id IN (
                        SELECT spot_id
                        FROM temp_calc_sadova
                        WHERE temp_need > 0
                        ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                        LIMIT v_remainder
                    );
                END IF;

                v_pool := 0;
            ELSE
                UPDATE temp_calc_sadova
                SET final_qty = final_qty + temp_need::integer
                WHERE temp_need > 0;

                v_pool := v_pool - v_total_need::integer;
            END IF;
        END IF;
    END IF;

    WHILE v_pool > 0 AND v_multiplier <= 4 LOOP
        UPDATE temp_calc_sadova
        SET temp_need = GREATEST(
            0,
            (min_stock * v_multiplier) - (effective_stock + final_qty)
        )
        WHERE TRUE;

        SELECT COALESCE(SUM(temp_need), 0)
        INTO v_total_need
        FROM temp_calc_sadova;

        EXIT WHEN v_total_need <= 0;

        IF v_pool < v_total_need THEN
            v_k := v_pool::numeric / v_total_need::numeric;

            UPDATE temp_calc_sadova
            SET final_qty = final_qty + FLOOR(temp_need * v_k)::integer
            WHERE temp_need > 0;

            SELECT GREATEST(
                v_pool - COALESCE(SUM(FLOOR(temp_need * v_k))::integer, 0),
                0
            )
            INTO v_remainder
            FROM temp_calc_sadova
            WHERE temp_need > 0;

            IF v_remainder > 0 THEN
                UPDATE temp_calc_sadova
                SET final_qty = final_qty + 1
                WHERE spot_id IN (
                    SELECT spot_id
                    FROM temp_calc_sadova
                    WHERE temp_need > 0
                    ORDER BY temp_need DESC, avg_sales_day DESC, spot_name ASC
                    LIMIT v_remainder
                );
            END IF;

            v_pool := 0;
        ELSE
            UPDATE temp_calc_sadova
            SET final_qty = final_qty + temp_need::integer
            WHERE temp_need > 0;

            v_pool := v_pool - v_total_need::integer;
            v_multiplier := v_multiplier + 1;
        END IF;
    END LOOP;

    INSERT INTO sadova1.distribution_results (
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
        t.spot_id,
        t.spot_name,
        t.final_qty,
        p_batch_id,
        p_business_date,
        'pending'
    FROM temp_calc_sadova t
    WHERE t.final_qty > 0;

    IF p_allow_warehouse_row AND v_pool > 0 THEN
        INSERT INTO sadova1.distribution_results (
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
            'Остаток на Складі',
            v_pool,
            p_batch_id,
            p_business_date,
            'delivered'
        );
    END IF;
END;
$function$;

