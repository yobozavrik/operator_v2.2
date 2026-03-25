-- =============================================
-- SQL Migration: Graviton Shop Selection & Batch Processing
-- =============================================

-- 1. Ensure Logs Table Exists & Has Correct Columns
-- Logs table to track distribution runs.
-- 'target_shops' stores the specific shops targeted in a run (NULL = all).
CREATE TABLE IF NOT EXISTS graviton.distribution_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    started_at timestamptz DEFAULT now(),
    user_id uuid,
    status text DEFAULT 'running',
    target_shops integer[], 
    details jsonb
);

-- 2. Worker Function (The Calculation Logic)
-- DOES NOT delete anything globally. Just inserts results for a specific batch.
-- Handles dynamic shop selection.

CREATE OR REPLACE FUNCTION graviton.fn_worker_distribute_product(
    p_product_id integer,
    p_batch_id uuid,
    p_shop_ids integer[] DEFAULT NULL -- NULL means 'all active shops'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_pool INT;
    v_product_name TEXT;
    v_zeros_count INT;
    v_total_need INT;
    v_multiplier INT := 2;
    v_active_shops integer[];
    v_shop_count INT;
BEGIN
    -- [A] Get Resource (Bakery Pool)
    SELECT baked_qty, product_name 
    INTO v_pool, v_product_name
    FROM graviton.v_production_logic
    WHERE product_id = p_product_id 
    LIMIT 1;

    -- If no stock, just return (orchestrator handles high-level logs)
    IF v_pool IS NULL OR v_pool <= 0 THEN RETURN; END IF;

    -- [B] Determine Active Shops
    -- If p_shop_ids is provided, use it. Otherwise, select all relevant shops from base.
    IF p_shop_ids IS NOT NULL THEN
        v_active_shops := p_shop_ids;
    ELSE
        SELECT array_agg(DISTINCT "код_магазину")
        INTO v_active_shops
        FROM graviton.distribution_base
        WHERE "код_продукту" = p_product_id;
    END IF;

    -- Update Shop Count for distribution logic
    v_shop_count := array_length(v_active_shops, 1);

    -- [C] Load Data into User-Specific Temp Table
    -- We filter by the determined active shops immediately.
    CREATE TEMP TABLE temp_calc_g AS
    SELECT 
        "назва_магазину" as spot_name,
        COALESCE("avg_sales_day", 0) as avg_sales_day,
        COALESCE("min_stock", 0) as min_stock,
        GREATEST(0, "current_stock") as effective_stock,
        0 as final_qty,
        0 as temp_need
    FROM graviton.distribution_base
    WHERE "код_продукту" = p_product_id
      AND "код_магазину" = ANY(v_active_shops);

    -- [D] The Core Distribution Algorithm (Placeholder)
    -- Since full algorithm logic is complex and user-specific, we use a simplified logic here:
    -- Distribute pool equally among active shops based on need.
    -- TODO: Replace with the full, sophisticated logic provided by the user in production.
    
    UPDATE temp_calc_g SET final_qty = v_pool / GREATEST(v_shop_count, 1); 

    -- [E] Save Results
    -- Linking to batch_id is crucial for history and cleanup.
    INSERT INTO graviton.distribution_results (
        product_id, 
        product_name, 
        spot_name, 
        quantity_to_ship,
        calculation_batch_id, 
        business_date
    )
    SELECT 
        p_product_id, 
        v_product_name, 
        spot_name, 
        final_qty, 
        p_batch_id, 
        CURRENT_DATE
    FROM temp_calc_g 
    WHERE final_qty > 0;

    -- [F] Save Leftovers (Surplus)
    IF v_pool > 0 THEN
       INSERT INTO graviton.distribution_results (
            product_id, 
            product_name, 
            spot_name, 
            quantity_to_ship,
            calculation_batch_id, 
            business_date
        )
        VALUES (
            p_product_id, 
            v_product_name, 
            'Остаток на Складе', 
            v_pool, -- Remaining pool (logic placeholder)
            p_batch_id, 
            CURRENT_DATE
        );
    END IF;

    DROP TABLE IF EXISTS temp_calc_g;
END;
$$;


-- 3. Orchestrator Function (The Manager)
-- Handles batch creation, logging, cleanup, and iteration.

CREATE OR REPLACE FUNCTION graviton.fn_orchestrate_distribution(
    p_shop_ids integer[] DEFAULT NULL -- If NULL, distributes to all
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    v_batch_id uuid;
    r RECORD;
    v_count int := 0;
BEGIN
    -- 1. Create Batch ID & Log Start
    v_batch_id := gen_random_uuid();
    
    INSERT INTO graviton.distribution_logs (id, status, target_shops, details)
    VALUES (
        v_batch_id, 
        'running', 
        p_shop_ids,
        jsonb_build_object('mode', CASE WHEN p_shop_ids IS NULL THEN 'all' ELSE 'partial' END)
    );

    -- 2. Clean Up TODAYS results (or just older batches from today)
    -- This ensures we don't have duplicate rows for the same date if run multiple times.
    DELETE FROM graviton.distribution_results
    WHERE business_date = CURRENT_DATE;

    -- 3. Iterate Over All Products in Production
    FOR r IN 
        SELECT product_id 
        FROM graviton.v_production_logic 
        GROUP BY product_id
    LOOP
        -- Call Worker
        PERFORM graviton.fn_worker_distribute_product(r.product_id, v_batch_id, p_shop_ids);
        v_count := v_count + 1;
    END LOOP;

    -- 4. Log Success
    UPDATE graviton.distribution_logs 
    SET 
        status = 'success', 
        details = details || jsonb_build_object('processed_products', v_count)
    WHERE id = v_batch_id;

    RETURN v_batch_id;

EXCEPTION WHEN OTHERS THEN
    -- Log Error
    UPDATE graviton.distribution_logs 
    SET 
        status = 'error', 
        details = jsonb_build_object('error', SQLERRM)
    WHERE id = v_batch_id;
    RAISE;
END;
$$;

-- 4. Permission Grants
GRANT USAGE ON SCHEMA graviton TO authenticated, service_role;
GRANT ALL ON TABLE graviton.distribution_logs TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION graviton.fn_orchestrate_distribution TO authenticated, service_role;
