-- 20260227_ml_forecasting.sql

-- Schema for ML features, predictions and model artifacts.
CREATE SCHEMA IF NOT EXISTS ml_forecasting;

-- 1. Table to store ML-generated recommendations/predictions
CREATE TABLE IF NOT EXISTS ml_forecasting.predictions (
    id SERIAL PRIMARY KEY,
    prediction_date DATE NOT NULL, -- The date the prediction is FOR
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- When the ML model generated it
    store_id INTEGER NOT NULL,
    sku_id BIGINT NOT NULL,
    recommended_kg NUMERIC(10, 2) NOT NULL, -- Suggested production amount
    confidence_score NUMERIC(5, 2), -- Output probability/confidence of the model
    features_used JSONB, -- The features the model used to make this prediction
    model_version TEXT
);

-- Index for quick lookups by date and store
CREATE INDEX idx_ml_predictions_date_store ON ml_forecasting.predictions(prediction_date, store_id);


-- 2. Table to store User overwrites (Human-in-the-loop)
CREATE TABLE IF NOT EXISTS ml_forecasting.user_overrides (
    id SERIAL PRIMARY KEY,
    prediction_id INTEGER REFERENCES ml_forecasting.predictions(id),
    target_date DATE NOT NULL,
    store_id INTEGER NOT NULL,
    sku_id BIGINT NOT NULL,
    original_recommended_kg NUMERIC(10, 2) NOT NULL,
    adjusted_kg NUMERIC(10, 2) NOT NULL,
    reason TEXT, -- Manager's reason for changing the ML plan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID -- Reference to auth.users if available, or just a text identifier
);


-- 3. Function to extract flat features for ML training (simplistic view for Python extraction)
-- Extracts from the craft daily mart.
CREATE OR REPLACE FUNCTION ml_forecasting.extract_training_data(
    p_start_date DATE, 
    p_end_date DATE
)
RETURNS TABLE (
    date DATE,
    store_id INTEGER,
    sku_id BIGINT,
    qty_delivered NUMERIC,
    qty_fresh_sold NUMERIC,
    qty_disc_sold NUMERIC,
    qty_waste NUMERIC,
    waste_rate NUMERIC,
    -- Simple rolling averages could go here if calculated on DB side, 
    -- but usually better calculated in Python using pandas.
    day_of_week INTEGER,
    is_weekend BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.date,
        m.store_id,
        m.sku_id,
        m.qty_delivered,
        m.qty_fresh_sold,
        m.qty_disc_sold,
        m.qty_waste,
        CASE WHEN m.qty_delivered > 0 THEN (m.qty_waste / m.qty_delivered) ELSE 0 END AS waste_rate,
        EXTRACT(ISODOW FROM m.date)::INTEGER AS day_of_week,
        EXTRACT(ISODOW FROM m.date) IN (6, 7) AS is_weekend
    FROM bakery1.mv_craft_daily_mart m
    WHERE m.date >= p_start_date AND m.date <= p_end_date
    ORDER BY m.date, m.store_id, m.sku_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
