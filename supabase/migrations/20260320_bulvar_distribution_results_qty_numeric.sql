-- Bulvar distribution in kg requires decimal shipment quantities.
-- Convert quantity_to_ship from integer-like type to numeric(12,3) safely.

DO $$
DECLARE
    v_data_type text;
BEGIN
    SELECT c.data_type
    INTO v_data_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'bulvar1'
      AND c.table_name = 'distribution_results'
      AND c.column_name = 'quantity_to_ship';

    IF v_data_type IN ('smallint', 'integer', 'bigint') THEN
        ALTER TABLE bulvar1.distribution_results
            ALTER COLUMN quantity_to_ship TYPE numeric(12,3)
            USING quantity_to_ship::numeric(12,3);
    END IF;
END
$$;
