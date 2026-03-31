-- ─── Migration: reservation accuracy fixes ────────────────────────────────────
--
-- 1. Add applied_result column (tracks what fn_apply_customer_reservation actually
--    subtracted from the network, stored as jsonb by the server after each run).
--
-- 2. Fix fn_apply_customer_reservation: was filtering distribution_results by
--    (created_at AT TIME ZONE 'Europe/Kyiv')::date which breaks if a recalculation
--    runs after midnight (created_at = next day, business_date = prev day).
--    Correct filter: same logic as v_today_distribution — join via distribution_logs
--    to the latest successful batch_id for the given business_date.

-- ── 1. applied_result column ──────────────────────────────────────────────────

ALTER TABLE pizza1.customer_reservations
    ADD COLUMN IF NOT EXISTS applied_result jsonb;

-- ── 2. Fixed fn_apply_customer_reservation ────────────────────────────────────

CREATE OR REPLACE FUNCTION pizza1.fn_apply_customer_reservation(
    p_business_date date,
    p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_name text;
    v_batch_id      uuid;
    v_item          RECORD;
    v_row           RECORD;
    v_remaining     numeric;
    v_applied       numeric;
    v_result        jsonb := '[]'::jsonb;
BEGIN
    -- Validate reservation exists
    SELECT customer_name
    INTO v_customer_name
    FROM pizza1.customer_reservations
    WHERE id = p_reservation_id;

    IF v_customer_name IS NULL THEN
        RAISE EXCEPTION 'Reservation % not found', p_reservation_id;
    END IF;

    -- Resolve the latest successful calculation batch for this business date.
    -- This mirrors v_today_distribution so we operate on exactly the same rows
    -- the results endpoint shows (avoids created_at timezone edge cases and
    -- stale rows from previous batches of the same day).
    SELECT batch_id
    INTO v_batch_id
    FROM pizza1.distribution_logs
    WHERE status = 'success'
      AND business_date = p_business_date
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_batch_id IS NULL THEN
        RAISE EXCEPTION 'No successful distribution batch found for %', p_business_date;
    END IF;

    -- Iterate over each requested SKU in the reservation
    FOR v_item IN
        SELECT sku, qty
        FROM pizza1.customer_reservation_items
        WHERE reservation_id = p_reservation_id
        ORDER BY sku
    LOOP
        v_remaining := GREATEST(0, COALESCE(v_item.qty, 0));
        v_applied   := 0;

        -- Consume rows for this SKU from largest spot to smallest.
        -- Skip the customer's own spot if it happens to appear.
        FOR v_row IN
            SELECT ctid, quantity_to_ship, spot_name
            FROM pizza1.distribution_results
            WHERE calculation_batch_id = v_batch_id
              AND product_name = v_item.sku
              AND COALESCE(spot_name, '') <> v_customer_name
            ORDER BY quantity_to_ship DESC, spot_name ASC
        LOOP
            EXIT WHEN v_remaining <= 0;

            IF COALESCE(v_row.quantity_to_ship, 0) <= v_remaining THEN
                -- Consume the entire row
                v_applied   := v_applied + COALESCE(v_row.quantity_to_ship, 0);
                v_remaining := v_remaining - COALESCE(v_row.quantity_to_ship, 0);

                DELETE FROM pizza1.distribution_results
                WHERE ctid = v_row.ctid;
            ELSE
                -- Partial consumption
                v_applied := v_applied + v_remaining;

                UPDATE pizza1.distribution_results
                SET quantity_to_ship = GREATEST(0, COALESCE(v_row.quantity_to_ship, 0) - v_remaining)
                WHERE ctid = v_row.ctid;

                v_remaining := 0;
            END IF;
        END LOOP;

        v_result := v_result || jsonb_build_array(
            jsonb_build_object(
                'sku',           v_item.sku,
                'requested_qty', COALESCE(v_item.qty, 0),
                'applied_qty',   v_applied,
                'missing_qty',   GREATEST(0, v_remaining)
            )
        );
    END LOOP;

    RETURN jsonb_build_object(
        'customer_name', v_customer_name,
        'items',         v_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION pizza1.fn_apply_customer_reservation(date, uuid) TO service_role;
