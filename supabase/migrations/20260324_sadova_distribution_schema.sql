-- Sadova workshop distribution schema and live orchestration pipeline.
-- Mirrors Graviton staged distribution flow (stage1 zero-stock, stage2 min-stock, stage3 top-up x2..x4).

CREATE SCHEMA IF NOT EXISTS sadova1;

CREATE TABLE IF NOT EXISTS sadova1.production_catalog (
    product_id integer PRIMARY KEY,
    category_id text NOT NULL DEFAULT 'auto',
    category_name text NOT NULL DEFAULT 'Auto (from production)',
    product_name text NOT NULL,
    portion_size numeric(12,3) NOT NULL DEFAULT 1,
    unit text NOT NULL DEFAULT 'кг',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sadova_catalog_active ON sadova1.production_catalog (is_active);
CREATE INDEX IF NOT EXISTS idx_sadova_catalog_name ON sadova1.production_catalog (product_name);

CREATE TABLE IF NOT EXISTS sadova1.distribution_shops (
    spot_id integer PRIMARY KEY,
    storage_id integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sadova_shops_active ON sadova1.distribution_shops (is_active);
CREATE INDEX IF NOT EXISTS idx_sadova_shops_storage ON sadova1.distribution_shops (storage_id);

CREATE TABLE IF NOT EXISTS sadova1.distribution_base (
    product_id integer NOT NULL,
    product_name text NOT NULL,
    spot_id integer NOT NULL,
    spot_name text NOT NULL,
    avg_sales_day numeric(14,3) NOT NULL DEFAULT 0,
    min_stock integer NOT NULL DEFAULT 0,
    current_stock numeric(14,3) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_sadova_base_product ON sadova1.distribution_base (product_id);
CREATE INDEX IF NOT EXISTS idx_sadova_base_spot ON sadova1.distribution_base (spot_id);

CREATE TABLE IF NOT EXISTS sadova1.distribution_results (
    id bigserial PRIMARY KEY,
    product_id integer NOT NULL,
    product_name text NOT NULL,
    spot_id integer,
    spot_name text NOT NULL,
    quantity_to_ship numeric(14,3) NOT NULL DEFAULT 0,
    calculation_batch_id uuid NOT NULL,
    business_date date NOT NULL,
    delivery_status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sadova_results_batch ON sadova1.distribution_results (calculation_batch_id);
CREATE INDEX IF NOT EXISTS idx_sadova_results_date ON sadova1.distribution_results (business_date);
CREATE INDEX IF NOT EXISTS idx_sadova_results_date_spot ON sadova1.distribution_results (business_date, spot_name);

CREATE TABLE IF NOT EXISTS sadova1.distribution_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL UNIQUE,
    business_date date NOT NULL,
    status text NOT NULL DEFAULT 'running',
    shop_ids_selected integer[],
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    products_count integer NOT NULL DEFAULT 0,
    total_kg numeric(14,3) NOT NULL DEFAULT 0,
    error_message text
);

CREATE INDEX IF NOT EXISTS idx_sadova_logs_batch ON sadova1.distribution_logs (batch_id);
CREATE INDEX IF NOT EXISTS idx_sadova_logs_date ON sadova1.distribution_logs (business_date);
CREATE INDEX IF NOT EXISTS idx_sadova_logs_status ON sadova1.distribution_logs (status);

CREATE TABLE IF NOT EXISTS sadova1.distribution_input_stocks (
    id bigserial PRIMARY KEY,
    batch_id uuid NOT NULL,
    business_date date NOT NULL,
    spot_id integer NOT NULL,
    storage_id integer NOT NULL,
    product_id integer,
    product_name text NOT NULL,
    product_name_normalized text NOT NULL,
    ingredient_id integer,
    ingredient_name text,
    stock_left numeric(14,3) NOT NULL,
    unit text,
    source text NOT NULL DEFAULT 'poster_live',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sadova_input_stocks_batch ON sadova1.distribution_input_stocks (batch_id);
CREATE INDEX IF NOT EXISTS idx_sadova_input_stocks_batch_spot ON sadova1.distribution_input_stocks (batch_id, spot_id, product_name_normalized);

CREATE TABLE IF NOT EXISTS sadova1.distribution_input_production (
    id bigserial PRIMARY KEY,
    batch_id uuid NOT NULL,
    business_date date NOT NULL,
    storage_id integer NOT NULL,
    product_id integer,
    product_name text NOT NULL,
    product_name_normalized text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    source text NOT NULL DEFAULT 'poster_live',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sadova_input_prod_batch ON sadova1.distribution_input_production (batch_id);
CREATE INDEX IF NOT EXISTS idx_sadova_input_prod_batch_product ON sadova1.distribution_input_production (batch_id, product_id);

CREATE TABLE IF NOT EXISTS sadova1.distribution_run_meta (
    batch_id uuid PRIMARY KEY,
    business_date date NOT NULL,
    selected_shop_ids integer[],
    full_run boolean NOT NULL,
    stocks_rows integer NOT NULL DEFAULT 0,
    manufactures_rows integer NOT NULL DEFAULT 0,
    partial_sync boolean NOT NULL DEFAULT false,
    failed_storages integer[],
    created_at timestamptz NOT NULL DEFAULT now()
);

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

    -- Stage 1: each zero-stock store gets one unit first.
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

    -- Stage 2: bring stores up to min_stock.
    IF v_pool > 0 THEN
        UPDATE temp_calc_sadova
        SET temp_need = GREATEST(0, min_stock - (effective_stock + final_qty));

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

    -- Stage 3: top-up with cap <= min_stock*4.
    WHILE v_pool > 0 AND v_multiplier <= 4 LOOP
        UPDATE temp_calc_sadova
        SET temp_need = GREATEST(
            0,
            (min_stock * v_multiplier) - (effective_stock + final_qty)
        );

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
            'Остаток на Складе',
            v_pool,
            p_batch_id,
            p_business_date,
            'delivered'
        );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION sadova1.fn_orchestrate_distribution_live(
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
    IF p_shop_ids IS NULL THEN
        v_effective_shop_ids := NULL;
        v_is_partial := false;
    ELSE
        SELECT array_agg(x.spot_id ORDER BY x.spot_id)
        INTO v_effective_shop_ids
        FROM (
            SELECT DISTINCT s.spot_id
            FROM sadova1.distribution_shops s
            WHERE s.is_active = true
              AND s.spot_id = ANY(p_shop_ids)
        ) x;

        IF v_effective_shop_ids IS NULL OR array_length(v_effective_shop_ids, 1) IS NULL THEN
            RAISE EXCEPTION 'No active Sadova shops matched requested p_shop_ids';
        END IF;

        v_is_partial := true;
    END IF;

    INSERT INTO sadova1.distribution_logs (
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

    IF v_is_partial THEN
        DELETE FROM sadova1.distribution_results dr
        WHERE dr.business_date = p_business_date
          AND dr.spot_id = ANY(v_effective_shop_ids);
    ELSE
        DELETE FROM sadova1.distribution_results
        WHERE business_date = p_business_date;
    END IF;

    FOR v_product_id IN
        SELECT DISTINCT ip.product_id
        FROM sadova1.distribution_input_production ip
        WHERE ip.batch_id = p_batch_id
          AND ip.quantity > 0
          AND ip.product_id IS NOT NULL
        ORDER BY ip.product_id
    LOOP
        BEGIN
            PERFORM sadova1.fn_run_distribution_v4(
                p_product_id := v_product_id,
                p_batch_id := p_batch_id,
                p_business_date := p_business_date,
                p_shop_ids := v_effective_shop_ids,
                p_allow_warehouse_row := NOT v_is_partial
            );
            v_count := v_count + 1;
        EXCEPTION
            WHEN OTHERS THEN
                UPDATE sadova1.distribution_logs
                SET error_message = COALESCE(error_message, '') ||
                    'Product ' || v_product_id || ': ' || SQLERRM || '; '
                WHERE id = v_log_id;
        END;
    END LOOP;

    SELECT COALESCE(SUM(dr.quantity_to_ship), 0)
    INTO v_total_kg
    FROM sadova1.distribution_results dr
    WHERE dr.calculation_batch_id = p_batch_id;

    UPDATE sadova1.distribution_logs
    SET
        status = 'success',
        completed_at = now(),
        products_count = v_count,
        total_kg = v_total_kg
    WHERE id = v_log_id;
EXCEPTION
    WHEN OTHERS THEN
        UPDATE sadova1.distribution_logs
        SET
            status = 'failed',
            completed_at = now(),
            error_message = SQLERRM
        WHERE id = v_log_id;
        RAISE;
END;
$function$;

CREATE OR REPLACE VIEW sadova1.v_sadova_today_distribution AS
SELECT
    dr.id,
    dr.product_id,
    dr.product_name,
    dr.spot_id,
    dr.spot_name,
    dr.quantity_to_ship,
    dr.calculation_batch_id,
    dr.business_date,
    dr.delivery_status,
    dr.created_at
FROM sadova1.distribution_results dr
WHERE dr.business_date = ((now() AT TIME ZONE 'Europe/Kyiv')::date);

CREATE OR REPLACE VIEW sadova1.v_sadova_distribution_stats AS
SELECT
    b.product_id,
    b.product_name,
    b.spot_id,
    b.spot_name,
    COALESCE(b.avg_sales_day, 0)::numeric AS avg_sales_day,
    COALESCE(b.min_stock, 0)::integer AS min_stock,
    GREATEST(0, COALESCE(s.stock_now, b.current_stock, 0))::numeric AS stock_now,
    COALESCE(p.baked_at_factory, 0)::numeric AS baked_at_factory,
    GREATEST(
        0,
        COALESCE(b.min_stock, 0)::numeric - GREATEST(0, COALESCE(s.stock_now, b.current_stock, 0))::numeric
    )::numeric AS need_net
FROM sadova1.distribution_base b
LEFT JOIN (
    SELECT
        i.product_id,
        i.spot_id,
        SUM(i.stock_left)::numeric AS stock_now
    FROM sadova1.distribution_input_stocks i
    WHERE i.business_date = ((now() AT TIME ZONE 'Europe/Kyiv')::date)
    GROUP BY i.product_id, i.spot_id
) s ON s.product_id = b.product_id AND s.spot_id = b.spot_id
LEFT JOIN (
    SELECT
        ip.product_id,
        SUM(ip.quantity)::numeric AS baked_at_factory
    FROM sadova1.distribution_input_production ip
    WHERE ip.business_date = ((now() AT TIME ZONE 'Europe/Kyiv')::date)
    GROUP BY ip.product_id
) p ON p.product_id = b.product_id;

CREATE OR REPLACE FUNCTION sadova1.fn_get_distribution_results(p_business_date date)
RETURNS TABLE (
    id bigint,
    product_id integer,
    product_name text,
    spot_id integer,
    spot_name text,
    quantity_to_ship numeric,
    calculation_batch_id uuid,
    business_date date,
    delivery_status text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
    SELECT
        dr.id,
        dr.product_id,
        dr.product_name,
        dr.spot_id,
        dr.spot_name,
        dr.quantity_to_ship,
        dr.calculation_batch_id,
        dr.business_date,
        dr.delivery_status,
        dr.created_at
    FROM sadova1.distribution_results dr
    WHERE dr.business_date = p_business_date
    ORDER BY dr.product_name ASC, dr.spot_name ASC;
$function$;

GRANT USAGE ON SCHEMA sadova1 TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.production_catalog TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_shops TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_base TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_results TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_logs TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_input_stocks TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_input_production TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.distribution_run_meta TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.v_sadova_today_distribution TO anon, authenticated, service_role;
GRANT SELECT ON sadova1.v_sadova_distribution_stats TO anon, authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON sadova1.production_catalog TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_shops TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_base TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_results TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_logs TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_input_stocks TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_input_production TO service_role;
GRANT INSERT, UPDATE, DELETE ON sadova1.distribution_run_meta TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sadova1 TO service_role;

GRANT EXECUTE ON FUNCTION sadova1.fn_run_distribution_v4(integer, uuid, date, integer[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sadova1.fn_orchestrate_distribution_live(uuid, date, integer[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sadova1.fn_get_distribution_results(date) TO anon, authenticated, service_role;
