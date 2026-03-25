-- 1. Drop the existing slow VIEW
DROP VIEW IF EXISTS bakery1.mv_craft_daily_mart;

-- 2. Create the MATERIALIZED VIEW (Pre-calculates data)
CREATE MATERIALIZED VIEW bakery1.mv_craft_daily_mart AS
WITH all_keys AS (
    SELECT "дата" AS date, "магазин_id" AS store_id, "товар_id" AS sku_id
    FROM bakery1."хліб_переміщення_поставки"
    WHERE ("дата" >= (CURRENT_DATE - 180))
    UNION
    SELECT "дата" AS date, "магазин_id" AS store_id, "товар_id" AS sku_id
    FROM bakery1."хліб_продажі_свіжі"
    WHERE ("дата" >= (CURRENT_DATE - 180))
    UNION
    SELECT (("дата" - '1 day'::interval))::date AS date, "магазин_id" AS store_id, "товар_id" AS sku_id
    FROM bakery1."хліб_продажі_хліб30"
    WHERE ("дата" >= (CURRENT_DATE - 180))
), fresh_sales AS (
    SELECT "дата" AS date, "магазин_id" AS store_id, "товар_id" AS sku_id,
        sum("кількість_шт") AS qty,
        sum("сума_грн") AS revenue
    FROM bakery1."хліб_продажі_свіжі"
    WHERE ("дата" >= (CURRENT_DATE - 180))
    GROUP BY 1, 2, 3
), disc_sales AS (
    SELECT (("дата" - '1 day'::interval))::date AS date, "магазин_id" AS store_id, "товар_id" AS sku_id,
        sum("кількість_шт") AS qty,
        sum("сума_грн") AS revenue
    FROM bakery1."хліб_продажі_хліб30"
    WHERE ("дата" >= (CURRENT_DATE - 180))
    GROUP BY 1, 2, 3
), actual_delivery AS (
    SELECT "дата" AS date, "магазин_id" AS store_id, "товар_id" AS sku_id,
        sum("кількість_шт") AS qty
    FROM bakery1."хліб_переміщення_поставки"
    WHERE ("дата" >= (CURRENT_DATE - 180))
    GROUP BY 1, 2, 3
)
SELECT k.date,
    k.store_id,
    s."магазин_назва" AS store_name,
    k.sku_id,
    p.name AS sku_name,
    COALESCE(d.qty, 0.0) AS qty_delivered,
    COALESCE(f.qty, 0.0) AS qty_fresh_sold,
    COALESCE(f.revenue, 0.0) AS revenue_fresh,
    COALESCE(ds.qty, 0.0) AS qty_disc_sold,
    COALESCE(ds.revenue, 0.0) AS revenue_disc,
    GREATEST(0.0, ((COALESCE(d.qty, 0.0) - COALESCE(f.qty, 0.0)) - COALESCE(ds.qty, 0.0))) AS qty_waste
FROM all_keys k
JOIN bakery1."довідник_магазинів" s ON k.store_id = s."магазин_id"
JOIN categories.products p ON k.sku_id = p.id
LEFT JOIN actual_delivery d ON k.date = d.date AND k.store_id = d.store_id AND k.sku_id = d.sku_id
LEFT JOIN fresh_sales f ON k.date = f.date AND k.store_id = f.store_id AND k.sku_id = f.sku_id
LEFT JOIN disc_sales ds ON k.date = ds.date AND k.store_id = ds.store_id AND k.sku_id = ds.sku_id;

-- 3. Create Indexes for instant performance
CREATE UNIQUE INDEX idx_mv_craft_daily_mart_unique ON bakery1.mv_craft_daily_mart (date, store_id, sku_id);
CREATE INDEX idx_mv_craft_daily_mart_date ON bakery1.mv_craft_daily_mart (date);

-- 4. Enable concurrent refresh (needs the unique index above)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY bakery1.mv_craft_daily_mart;
