-- 20260316_ml_features_dow_views.sql

-- 1. Базовое представление с расчетом признаков (features)
-- Используем (qty_fresh_sold + qty_disc_sold) как общую потребность (total_demand)
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_enriched_features AS
WITH base AS (
    SELECT 
        date,
        store_id,
        sku_id,
        (qty_fresh_sold + qty_disc_sold) as total_demand,
        EXTRACT(DOW FROM date)::INTEGER as dow,
        EXTRACT(DOW FROM date) IN (0, 6) as is_weekend
    FROM bakery1.mv_craft_daily_mart
)
SELECT
    *,
    -- Лаги: 1 день, 2 дня, 1 неделя
    LAG(total_demand, 1) OVER (PARTITION BY store_id, sku_id ORDER BY date) as lag1,
    LAG(total_demand, 2) OVER (PARTITION BY store_id, sku_id ORDER BY date) as lag2,
    LAG(total_demand, 7) OVER (PARTITION BY store_id, sku_id ORDER BY date) as lag7,
    -- Скользящее среднее за 3 дня (не включая текущий)
    AVG(total_demand) OVER (
        PARTITION BY store_id, sku_id 
        ORDER BY date 
        ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING
    ) as ma3
FROM base;

-- 2. 7 специализированных вью для обучения экспертов по дням недели
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_0 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 0;
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_1 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 1;
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_2 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 2;
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_3 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 3;
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_4 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 4;
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_5 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 5;
CREATE OR REPLACE VIEW ml_forecasting.v_bakery_features_dow_6 AS SELECT * FROM ml_forecasting.v_bakery_enriched_features WHERE dow = 6;
