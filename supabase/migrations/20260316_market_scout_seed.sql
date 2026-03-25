-- 20260316_market_scout_seed.sql
-- Seed data for Scout module "Розвідник"

-- Insert Competitors
INSERT INTO ml_forecasting.scout_competitors (name, city, segment, priority) VALUES
('Boulangerie Artisan', 'Київ', 'premium', 'high'),
('Волконський', 'Київ', 'premium', 'high'),
('Хлібний', 'Київ', 'mass-market', 'medium'),
('Кулиничі', 'Київ', 'mass-market', 'medium'),
('Франс.уа', 'Київ', 'mass-market', 'low')
ON CONFLICT DO NOTHING;

-- Insert Sources
INSERT INTO ml_forecasting.scout_sources (name, type, url) VALUES
('Instagram - Boulangerie', 'instagram', 'https://instagram.com/boulangerie'),
('Telegram - Хлібний', 'telegram', 'https://t.me/khlibnyi'),
('Web - Волконський', 'website', 'https://volkonskiy.ua')
ON CONFLICT DO NOTHING;

-- Insert some Normalized Events (Demo)
DO $$
DECLARE
    comp_boul UUID;
    comp_volk UUID;
    comp_hleb UUID;
BEGIN
    SELECT id INTO comp_boul FROM ml_forecasting.scout_competitors WHERE name = 'Boulangerie Artisan' LIMIT 1;
    SELECT id INTO comp_volk FROM ml_forecasting.scout_competitors WHERE name = 'Волконський' LIMIT 1;
    SELECT id INTO comp_hleb FROM ml_forecasting.scout_competitors WHERE name = 'Хлібний' LIMIT 1;

    INSERT INTO ml_forecasting.scout_normalized_events 
    (event_type, sku_name, category, promo_type, discount_pct, summary_uk, event_date, competitor_id, severity)
    VALUES
    ('акція', 'Багет французький', 'багети', 'знижка', 20, 'Вечірня знижка 20% на всі багети після 20:00', CURRENT_DATE, comp_boul, 'medium'),
    ('новий_sku', 'Круасан з мигдалем', 'круасани', NULL, NULL, 'Запущено нову лінійку преміум круасанів', CURRENT_DATE - 1, comp_volk, 'high'),
    ('зміння_ціни', 'Хліб Бородинський', 'житній хліб', 'підвищення', NULL, 'Ціна зросла на 5% через логістику', CURRENT_DATE - 2, comp_hleb, 'low'),
    ('акція', 'Чіабата', 'хліб', '1+1', 50, 'Акція 1+1 на білий хліб у вихідні', CURRENT_DATE, comp_hleb, 'medium');
END $$;

-- Insert some tags
INSERT INTO ml_forecasting.scout_event_tags (event_id, tag)
SELECT id, 'discount' FROM ml_forecasting.scout_normalized_events WHERE event_type = 'акція'
ON CONFLICT DO NOTHING;

-- Insert Daily Metrics Table
INSERT INTO ml_forecasting.scout_daily_competitor_metrics (date, competitor_id, promo_count, new_sku_count, avg_discount, price_changes_count)
SELECT CURRENT_DATE, id, 1, 0, 10, 0 FROM ml_forecasting.scout_competitors
ON CONFLICT (date, competitor_id) DO UPDATE SET promo_count = EXCLUDED.promo_count;

-- Insert simple recommendations
INSERT INTO ml_forecasting.scout_recommendations (text_uk, rationale, priority) VALUES
('Запустити акцію на круасани (-15%)', 'Волконський активізував промо в цій категорії', 'high'),
('Переглянути ціну на Багет', 'Boulangerie демпінгує вечірніми знижками', 'medium'),
('Додати сезонний SKU з мигдалем', 'Тренд на мигдалеву начинку в преміум сегменті', 'low');
