-- Sadova live-run RPC: persist snapshot payloads and trigger SQL orchestrator.
-- API should only collect external payloads and call this function.

CREATE OR REPLACE FUNCTION sadova1.fn_run_distribution_live(
    p_business_date date DEFAULT ((now() AT TIME ZONE 'Europe/Kyiv')::date),
    p_shop_ids integer[] DEFAULT NULL::integer[],
    p_workshop_storage_id integer DEFAULT 34,
    p_stocks jsonb DEFAULT '[]'::jsonb,
    p_production jsonb DEFAULT '[]'::jsonb,
    p_failed_storages integer[] DEFAULT NULL::integer[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
AS $function$
DECLARE
    v_batch_id uuid := gen_random_uuid();
    v_stocks_rows integer := 0;
    v_production_rows integer := 0;
    v_full_run boolean := p_shop_ids IS NULL OR array_length(p_shop_ids, 1) IS NULL;
BEGIN
    IF p_stocks IS NULL THEN
        p_stocks := '[]'::jsonb;
    END IF;
    IF p_production IS NULL THEN
        p_production := '[]'::jsonb;
    END IF;

    INSERT INTO sadova1.distribution_input_stocks (
        batch_id,
        business_date,
        spot_id,
        storage_id,
        product_id,
        product_name,
        product_name_normalized,
        ingredient_id,
        ingredient_name,
        stock_left,
        unit,
        source
    )
    SELECT
        v_batch_id,
        p_business_date,
        s.spot_id,
        s.storage_id,
        s.product_id,
        s.product_name,
        s.product_name_normalized,
        s.ingredient_id,
        s.ingredient_name,
        COALESCE(s.stock_left, 0),
        s.unit,
        COALESCE(s.source, 'poster_live')
    FROM jsonb_to_recordset(p_stocks) AS s(
        spot_id integer,
        storage_id integer,
        product_id integer,
        product_name text,
        product_name_normalized text,
        ingredient_id integer,
        ingredient_name text,
        stock_left numeric,
        unit text,
        source text
    )
    WHERE s.spot_id IS NOT NULL
      AND s.storage_id IS NOT NULL
      AND s.product_name IS NOT NULL
      AND s.product_name_normalized IS NOT NULL;

    GET DIAGNOSTICS v_stocks_rows = ROW_COUNT;

    INSERT INTO sadova1.distribution_input_production (
        batch_id,
        business_date,
        storage_id,
        product_id,
        product_name,
        product_name_normalized,
        quantity,
        source
    )
    SELECT
        v_batch_id,
        p_business_date,
        COALESCE(p.storage_id, p_workshop_storage_id),
        p.product_id,
        p.product_name,
        p.product_name_normalized,
        COALESCE(p.quantity, 0),
        COALESCE(p.source, 'poster_live')
    FROM jsonb_to_recordset(p_production) AS p(
        storage_id integer,
        product_id integer,
        product_name text,
        product_name_normalized text,
        quantity numeric,
        source text
    )
    WHERE p.product_name IS NOT NULL
      AND p.product_name_normalized IS NOT NULL
      AND COALESCE(p.quantity, 0) > 0;

    GET DIAGNOSTICS v_production_rows = ROW_COUNT;

    INSERT INTO sadova1.distribution_run_meta (
        batch_id,
        business_date,
        selected_shop_ids,
        full_run,
        stocks_rows,
        manufactures_rows,
        partial_sync,
        failed_storages
    )
    VALUES (
        v_batch_id,
        p_business_date,
        CASE WHEN v_full_run THEN NULL ELSE p_shop_ids END,
        v_full_run,
        v_stocks_rows,
        v_production_rows,
        COALESCE(array_length(p_failed_storages, 1), 0) > 0,
        p_failed_storages
    );

    -- Keep operational baseline in DB fresh.
    PERFORM sadova1.refresh_distribution_base(14, 1.5, NULL);

    PERFORM sadova1.fn_orchestrate_distribution_live(
        p_batch_id := v_batch_id,
        p_business_date := p_business_date,
        p_shop_ids := CASE WHEN v_full_run THEN NULL ELSE p_shop_ids END
    );

    RETURN v_batch_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION sadova1.fn_run_distribution_live(
    date,
    integer[],
    integer,
    jsonb,
    jsonb,
    integer[]
) TO authenticated, service_role;

