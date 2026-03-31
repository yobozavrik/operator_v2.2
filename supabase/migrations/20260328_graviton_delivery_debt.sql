-- ============================================================
-- Migration: Graviton delivery debt layer
-- Date: 2026-03-28
--
-- Adds a non-destructive "delivery debt" mechanism:
--   - graviton.delivery_debt         — accumulates undelivered kg per shop/product
--   - graviton.fn_confirm_delivery   — logist confirms which shops received delivery
--   - graviton.fn_run_distribution_v4 — updated to include debt in Stage 2 need calc
--
-- SAFE TO APPLY:
--   delivery_debt starts empty → debt_kg = 0 everywhere →
--   fn_run_distribution_v4 behaviour is IDENTICAL to current until
--   first fn_confirm_delivery call populates the table.
--
-- Rollback: see comment at bottom.
-- ============================================================

BEGIN;

-- ─── 1. DELIVERY DEBT TABLE ───────────────────────────────────────────────────
-- One row per (shop, product). Accumulates undelivered kg across days.
-- Cleared when logist confirms delivery for a shop.

CREATE TABLE IF NOT EXISTS graviton.delivery_debt (
    spot_id      integer      NOT NULL,
    product_id   integer      NOT NULL,
    product_name text,
    spot_name    text,
    debt_kg      integer      NOT NULL DEFAULT 0,
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT delivery_debt_pkey PRIMARY KEY (spot_id, product_id),
    CONSTRAINT delivery_debt_debt_kg_nonneg CHECK (debt_kg >= 0)
);

CREATE INDEX IF NOT EXISTS idx_delivery_debt_spot
    ON graviton.delivery_debt (spot_id)
    WHERE debt_kg > 0;

COMMENT ON TABLE graviton.delivery_debt IS
    'Accumulated undelivered kg per shop/product. '
    'Populated by fn_confirm_delivery when a shop is excluded from a delivery run. '
    'Cleared when that shop next receives a confirmed delivery. '
    'fn_run_distribution_v4 reads this to boost Stage 2 need for shops with debt.';

-- ─── 2. fn_confirm_delivery ───────────────────────────────────────────────────
-- Called by the logist after physical delivery.
-- p_business_date      — the distribution date being confirmed (usually today)
-- p_delivered_spot_ids — shops that actually received delivery
--
-- Actions:
--   A. Accumulate debt for shops NOT in delivered list (their pending rows → debt)
--   B. Clear debt for delivered shops (they received everything owed)
--   C. Mark distribution_results rows: delivered / skipped

CREATE OR REPLACE FUNCTION graviton.fn_confirm_delivery(
    p_business_date      date,
    p_delivered_spot_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '60s'
AS $$
DECLARE
    v_debt_rows      integer := 0;
    v_delivered_rows integer := 0;
BEGIN
    -- Safety: treat NULL as empty array
    IF p_delivered_spot_ids IS NULL THEN
        p_delivered_spot_ids := ARRAY[]::integer[];
    END IF;

    -- A. Accumulate debt for shops that did NOT receive delivery today.
    --    Map spot_name → spot_id via distribution_base (source of truth for this module).
    --    Uses UPSERT so repeated calls are safe (idempotent accumulation).
    INSERT INTO graviton.delivery_debt
        (spot_id, product_id, product_name, spot_name, debt_kg, updated_at)
    SELECT
        b_map.spot_id,
        dr.product_id,
        dr.product_name,
        dr.spot_name,
        SUM(dr.quantity_to_ship)::integer AS debt_kg,
        now()
    FROM graviton.distribution_results dr
    JOIN (
        SELECT DISTINCT
            "код_магазину"::integer AS spot_id,
            "назва_магазину"        AS spot_name
        FROM graviton.distribution_base
    ) b_map ON b_map.spot_name = dr.spot_name
    WHERE dr.business_date      = p_business_date
      AND dr.delivery_status    = 'pending'
      AND dr.product_id         IS NOT NULL
      AND dr.spot_name          != 'Остаток на Складе'
      AND b_map.spot_id         != ALL(p_delivered_spot_ids)
    GROUP BY b_map.spot_id, dr.product_id, dr.product_name, dr.spot_name
    ON CONFLICT (spot_id, product_id) DO UPDATE
        SET debt_kg    = graviton.delivery_debt.debt_kg + EXCLUDED.debt_kg,
            updated_at = now();

    GET DIAGNOSTICS v_debt_rows = ROW_COUNT;

    -- B. Clear debt for shops that DID receive delivery.
    --    They received their owed stock — slate is clean.
    UPDATE graviton.delivery_debt
    SET debt_kg    = 0,
        updated_at = now()
    WHERE spot_id = ANY(p_delivered_spot_ids)
      AND debt_kg > 0;

    -- C1. Mark delivered shops' results as 'delivered'.
    UPDATE graviton.distribution_results
    SET delivery_status = 'delivered'
    WHERE business_date    = p_business_date
      AND delivery_status  = 'pending'
      AND spot_name IN (
          SELECT DISTINCT "назва_магазину"
          FROM graviton.distribution_base
          WHERE "код_магазину" = ANY(p_delivered_spot_ids)
      );

    GET DIAGNOSTICS v_delivered_rows = ROW_COUNT;

    -- C2. Mark remaining pending rows (non-delivered shops) as 'skipped'.
    UPDATE graviton.distribution_results
    SET delivery_status = 'skipped'
    WHERE business_date   = p_business_date
      AND delivery_status = 'pending'
      AND spot_name       != 'Остаток на Складе';

    RETURN jsonb_build_object(
        'delivered_spots',  array_length(p_delivered_spot_ids, 1),
        'delivered_rows',   v_delivered_rows,
        'debt_rows_added',  v_debt_rows
    );
END;
$$;

COMMENT ON FUNCTION graviton.fn_confirm_delivery IS
    'Confirms physical delivery for a set of shops on a given date. '
    'Accumulates undelivered kg into delivery_debt for skipped shops. '
    'Clears debt for delivered shops. '
    'Marks distribution_results rows as delivered / skipped. '
    'Safe to call multiple times for the same date (idempotent via UPSERT).';

-- ─── 3. fn_run_distribution_v4 — updated with debt awareness ─────────────────
-- CHANGES vs original (marked with -- [DEBT]):
--   a. temp_calc_g gets a debt_kg column (LEFT JOIN delivery_debt)
--   b. Stage 2 temp_need includes debt_kg so shops with debt get priority
--
-- Everything else is IDENTICAL to the original v4 function.

CREATE OR REPLACE FUNCTION graviton.fn_run_distribution_v4(
    p_product_id          integer,
    p_batch_id            uuid,
    p_business_date       date,
    p_shop_ids            integer[] DEFAULT NULL::integer[],
    p_allow_warehouse_row boolean   DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $$
DECLARE
    v_pool               integer;
    v_product_name       text;
    v_norm_name          text;
    v_zeros_count        integer;
    v_total_need         numeric;
    v_multiplier         integer := 2;
    v_k                  numeric;
    v_remainder          integer;
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
    WHERE batch_id                = p_batch_id
      AND product_name_normalized = v_norm_name;

    IF v_pool IS NULL OR v_pool <= 0 THEN
        RETURN;
    END IF;

    DROP TABLE IF EXISTS temp_calc_g;

    -- Create temp table: historical configs + live stock + debt  [DEBT: added debt_kg]
    CREATE TEMP TABLE temp_calc_g AS
    SELECT
        b."код_магазину"::integer                                  AS spot_id,
        b."назва_магазину"::text                                   AS spot_name,
        COALESCE(b."avg_sales_day", 0)::numeric                    AS avg_sales_day,
        COALESCE(b."min_stock", 0)::integer                        AS min_stock,
        GREATEST(0, COALESCE(s.total_stock_left, 0))::numeric      AS effective_stock,
        COALESCE(d.debt_kg, 0)::integer                            AS debt_kg,  -- [DEBT]
        0::integer                                                 AS final_qty,
        0::numeric                                                 AS temp_need
    FROM graviton.distribution_base b
    LEFT JOIN (
        SELECT spot_id, SUM(stock_left) AS total_stock_left
        FROM graviton.distribution_input_stocks
        WHERE batch_id                = p_batch_id
          AND product_name_normalized = v_norm_name
        GROUP BY spot_id
    ) s ON s.spot_id = b."код_магазину"
    LEFT JOIN graviton.delivery_debt d                             -- [DEBT]
           ON d.spot_id    = b."код_магазину"::integer             -- [DEBT]
          AND d.product_id = p_product_id                          -- [DEBT]
          AND d.debt_kg    > 0                                     -- [DEBT] only join when debt exists
    WHERE b."код_продукту" = p_product_id
      AND b."код_магазину" = ANY(v_effective_shop_ids);

    IF NOT EXISTS (SELECT 1 FROM temp_calc_g) THEN
        RETURN;
    END IF;

    -- =====================================================
    -- Stage 1: zero-stock stores get at least 1 unit
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
    -- Stage 2: bring stores up to min_stock + cover debt
    -- [DEBT]: temp_need now includes debt_kg so shops with
    -- accumulated undelivered debt get priority allocation.
    -- If debt_kg = 0 (no debt), formula is identical to original.
    -- =====================================================
    IF v_pool > 0 THEN
        UPDATE temp_calc_g
        SET temp_need = GREATEST(0, min_stock + debt_kg - (effective_stock + final_qty))  -- [DEBT]
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
    -- Save shop rows
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
$$;

-- ─── GRANTS ───────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON graviton.delivery_debt TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION graviton.fn_confirm_delivery TO service_role, authenticated;

COMMIT;

-- ─── ROLLBACK PROCEDURE (if needed) ──────────────────────────────────────────
-- 1. Restore original fn_run_distribution_v4 (remove debt_kg column and Stage 2 change):
--    Remove LEFT JOIN graviton.delivery_debt from temp_calc_g
--    Change Stage 2: SET temp_need = GREATEST(0, min_stock - (effective_stock + final_qty))
-- 2. DROP FUNCTION graviton.fn_confirm_delivery;
-- 3. DROP TABLE graviton.delivery_debt;
-- distribution_results rows with delivery_status='skipped' remain but are harmless.
