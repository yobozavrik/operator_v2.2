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
    v_item RECORD;
    v_row RECORD;
    v_remaining numeric;
    v_applied numeric;
    v_result jsonb := '[]'::jsonb;
BEGIN
    SELECT customer_name
    INTO v_customer_name
    FROM pizza1.customer_reservations
    WHERE id = p_reservation_id;

    IF v_customer_name IS NULL THEN
        RAISE EXCEPTION 'Reservation % not found', p_reservation_id;
    END IF;

    FOR v_item IN
        SELECT sku, qty
        FROM pizza1.customer_reservation_items
        WHERE reservation_id = p_reservation_id
        ORDER BY sku
    LOOP
        v_remaining := GREATEST(0, COALESCE(v_item.qty, 0));
        v_applied := 0;

        FOR v_row IN
            SELECT ctid, quantity_to_ship, spot_name
            FROM pizza1.distribution_results
            WHERE (created_at AT TIME ZONE 'Europe/Kyiv')::date = p_business_date
              AND product_name = v_item.sku
              AND COALESCE(spot_name, '') <> v_customer_name
            ORDER BY quantity_to_ship DESC, spot_name ASC
        LOOP
            EXIT WHEN v_remaining <= 0;

            IF COALESCE(v_row.quantity_to_ship, 0) <= v_remaining THEN
                v_applied := v_applied + COALESCE(v_row.quantity_to_ship, 0);
                v_remaining := v_remaining - COALESCE(v_row.quantity_to_ship, 0);

                DELETE FROM pizza1.distribution_results
                WHERE ctid = v_row.ctid;
            ELSE
                v_applied := v_applied + v_remaining;

                UPDATE pizza1.distribution_results
                SET quantity_to_ship = GREATEST(0, COALESCE(v_row.quantity_to_ship, 0) - v_remaining)
                WHERE ctid = v_row.ctid;

                v_remaining := 0;
            END IF;
        END LOOP;

        v_result := v_result || jsonb_build_array(
            jsonb_build_object(
                'sku', v_item.sku,
                'requested_qty', COALESCE(v_item.qty, 0),
                'applied_qty', v_applied,
                'missing_qty', GREATEST(0, v_remaining)
            )
        );
    END LOOP;

    RETURN jsonb_build_object(
        'customer_name', v_customer_name,
        'items', v_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION pizza1.fn_apply_customer_reservation(date, uuid) TO service_role;
