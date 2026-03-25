-- 20260223_craft_bread_analytics.sql

-- 1. Создание материализованного представления mv_craft_daily_mart
DROP MATERIALIZED VIEW IF EXISTS bakery1.mv_craft_daily_mart CASCADE;

CREATE MATERIALIZED VIEW bakery1.mv_craft_daily_mart AS
WITH craft_sku AS (
    SELECT id AS sku_id, name AS sku_name
    FROM categories.products
    WHERE category_id = '36'
),
daily_base AS (
    -- Базовая таблица доставок из цеха в магазины
    SELECT 
        d.dist_date AS date,
        d.store_id,
        m.магазин_назва AS store_name,
        d.sku_id,
        c.sku_name,
        d.allocated_qty AS qty_delivered
    FROM bakery1.bread_distribution_fact d
    JOIN bakery1.довідник_магазинів m ON d.store_id = m.магазин_id
    JOIN craft_sku c ON d.sku_id = c.sku_id
),
fresh_sales AS (
    -- Продажи свежего хлеба (день в день)
    SELECT 
        дата AS date,
        магазин_id AS store_id,
        товар_id AS sku_id,
        SUM(кількість_шт) AS qty_fresh_sold,
        SUM(сума_грн) AS revenue_fresh
    FROM public.хліб_продажі_свіжі
    WHERE товар_id IN (SELECT sku_id FROM craft_sku)
    GROUP BY 1, 2, 3
),
disc_sales AS (
    -- Продажи со скидкой (считаем, что они относятся к доставке предыдущего дня)
    SELECT 
        (дата - INTERVAL '1 day')::DATE AS delivery_date,
        магазин_id AS store_id,
        товар_id AS sku_id,
        SUM(кількість_шт) AS qty_disc_sold,
        SUM(сума_грн) AS revenue_disc
    FROM public.хліб_продажі_хліб30
    WHERE товар_id IN (SELECT sku_id FROM craft_sku)
    GROUP BY 1, 2, 3
)
SELECT 
    b.date,
    b.store_id,
    b.store_name,
    b.sku_id,
    b.sku_name,
    COALESCE(b.qty_delivered, 0) AS qty_delivered,
    COALESCE(f.qty_fresh_sold, 0) AS qty_fresh_sold,
    COALESCE(d.qty_disc_sold, 0) AS qty_disc_sold,
    GREATEST(COALESCE(b.qty_delivered, 0) - COALESCE(f.qty_fresh_sold, 0) - COALESCE(d.qty_disc_sold, 0), 0) AS qty_waste,
    COALESCE(f.revenue_fresh, 0) AS revenue_fresh,
    COALESCE(d.revenue_disc, 0) AS revenue_disc
FROM daily_base b
LEFT JOIN fresh_sales f ON b.date = f.date AND b.store_id = f.store_id AND b.sku_id = f.sku_id
LEFT JOIN disc_sales d ON b.date = d.delivery_date AND b.store_id = d.store_id AND b.sku_id = d.sku_id;

CREATE UNIQUE INDEX idx_mv_craft_daily_mart_uniq ON bakery1.mv_craft_daily_mart (date, store_id, sku_id);

-- 2. Таблица очереди алертов
CREATE TABLE IF NOT EXISTS bakery1.alerts_queue (
    id SERIAL PRIMARY KEY,
    alert_date DATE NOT NULL,
    alert_type TEXT NOT NULL,
    description TEXT NOT NULL,
    store_id INTEGER,
    sku_id BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Функции API

-- Общие метрики по сети
CREATE OR REPLACE FUNCTION bakery1.f_craft_get_network_metrics(p_start_date DATE, p_end_date DATE)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'qty_delivered', SUM(qty_delivered),
        'qty_fresh_sold', SUM(qty_fresh_sold),
        'qty_disc_sold', SUM(qty_disc_sold),
        'qty_waste', SUM(qty_waste),
        'revenue_fresh', SUM(revenue_fresh),
        'revenue_disc', SUM(revenue_disc),
        'waste_rate', CASE WHEN SUM(qty_delivered) > 0 THEN ROUND(SUM(qty_waste)::NUMERIC / SUM(qty_delivered) * 100, 2) ELSE 0 END,
        'sell_through_rate', CASE WHEN SUM(qty_delivered) > 0 THEN ROUND((SUM(qty_fresh_sold) + SUM(qty_disc_sold))::NUMERIC / SUM(qty_delivered) * 100, 2) ELSE 0 END
    ) INTO result
    FROM bakery1.mv_craft_daily_mart
    WHERE date >= p_start_date AND date <= p_end_date;
    RETURN COALESCE(result, '{}'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ренкинг магазинов и SKU
CREATE OR REPLACE FUNCTION bakery1.f_craft_get_store_ranking(p_start_date DATE, p_end_date DATE)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'top_stores', (
            SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON)
            FROM (
                SELECT store_id, store_name, SUM(qty_fresh_sold + qty_disc_sold) as total_sold, SUM(qty_waste) as total_waste
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_sold DESC
                LIMIT 5
            ) t
        ),
        'bottom_stores', (
            SELECT COALESCE(json_agg(row_to_json(b)), '[]'::JSON)
            FROM (
                SELECT store_id, store_name, SUM(qty_fresh_sold + qty_disc_sold) as total_sold, SUM(qty_waste) as total_waste
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_sold ASC
                LIMIT 5
            ) b
        ),
        'sku_abc', (
            SELECT COALESCE(json_agg(row_to_json(s)), '[]'::JSON)
            FROM (
                SELECT sku_id, sku_name, SUM(qty_fresh_sold + qty_disc_sold) as total_sold, SUM(revenue_fresh + revenue_disc) as total_revenue
                FROM bakery1.mv_craft_daily_mart
                WHERE date >= p_start_date AND date <= p_end_date
                GROUP BY 1, 2
                ORDER BY total_revenue DESC
            ) s
        )
    ) INTO result;
    RETURN COALESCE(result, '{}'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Матрица трендов по SKU/Магазинам
CREATE OR REPLACE FUNCTION bakery1.f_craft_get_sku_trend(p_date DATE)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    WITH store_sku_stats AS (
        SELECT 
            store_id, store_name, sku_id, sku_name,
            SUM(CASE WHEN date BETWEEN p_date - 13 AND p_date THEN qty_fresh_sold + qty_disc_sold ELSE 0 END) AS sold_14d,
            SUM(CASE WHEN date BETWEEN p_date - 41 AND p_date - 14 THEN qty_fresh_sold + qty_disc_sold ELSE 0 END) AS sold_28d_prev
        FROM bakery1.mv_craft_daily_mart
        WHERE date BETWEEN p_date - 41 AND p_date
        GROUP BY 1, 2, 3, 4
    ),
    trends AS (
        SELECT 
            *,
            (sold_14d / 14.0) AS avg_14d,
            (sold_28d_prev / 28.0) AS avg_28d_prev,
            CASE 
                WHEN (sold_28d_prev / 28.0) > 0 THEN ROUND(((sold_14d / 14.0) / (sold_28d_prev / 28.0)), 2)
                ELSE NULL 
            END AS trend_index
        FROM store_sku_stats
    )
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::JSON) INTO result FROM trends t;
    
    RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Функция ночного обновления (pg_cron)
CREATE OR REPLACE FUNCTION bakery1.f_craft_nightly_refresh_and_alerts()
RETURNS void AS $$
DECLARE
    -- Финальный расчет списаний и алерты генерируются строго для D-2,
    -- так как жизненный цикл D+1 (распродажа дисконта на следующий день) уже полностью завершен.
    v_date DATE := CURRENT_DATE - 2; 
BEGIN
    -- Обновление витрины в фоне, чтобы не блокировать чтение для дашборда Antigravity
    REFRESH MATERIALIZED VIEW CONCURRENTLY bakery1.mv_craft_daily_mart;
    
    -- Сценарий 1: Всплеск брака/списаний сети
    INSERT INTO bakery1.alerts_queue (alert_date, alert_type, description, store_id, sku_id)
    SELECT 
        v_date,
        'NETWORK_WASTE_SPIKE',
        'Возможный брак на производстве или опоздание логистики, проверьте партию! Waste Rate > 10% более чем в 50% магазинов.',
        NULL,
        sku_id
    FROM (
        SELECT 
            sku_id,
            COUNT(*) AS total_stores,
            SUM(CASE WHEN qty_delivered > 0 AND (qty_waste::numeric / qty_delivered) > 0.10 THEN 1 ELSE 0 END) AS high_waste_stores
        FROM bakery1.mv_craft_daily_mart
        WHERE date = v_date
        GROUP BY sku_id
    ) t
    WHERE total_stores > 0 AND (high_waste_stores::numeric / total_stores) >= 0.50;

    -- Сценарий 2: Больной магазин (Waste > 15% три дня подряд)
    INSERT INTO bakery1.alerts_queue (alert_date, alert_type, description, store_id, sku_id)
    SELECT 
        v_date,
        'SICK_STORE',
        'Проверьте выкладку и работу продавца. Хлеб уходит в мусор (Waste Rate > 15% 3 дня подряд).',
        store_id,
        NULL
    FROM (
        SELECT 
            store_id,
            SUM(CASE WHEN qty_delivered > 0 AND (qty_waste::numeric / qty_delivered) > 0.15 THEN 1 ELSE 0 END) AS high_waste_days
        FROM bakery1.mv_craft_daily_mart
        WHERE date BETWEEN v_date - 2 AND v_date
        GROUP BY store_id
    ) t2
    WHERE high_waste_days >= 3;

    -- Сценарий 3: Пустая полка (Censored Demand)
    INSERT INTO bakery1.alerts_queue (alert_date, alert_type, description, store_id, sku_id)
    SELECT 
        v_date,
        'CENSORED_DEMAND',
        'Точка недополучает выручку. Полка была пустой вечером (Фреш 100%, Дисконт 0). Увеличьте квоту.',
        store_id,
        sku_id
    FROM bakery1.mv_craft_daily_mart
    WHERE date = v_date AND qty_delivered > 0 AND qty_fresh_sold = qty_delivered AND qty_disc_sold = 0 AND qty_waste = 0;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
