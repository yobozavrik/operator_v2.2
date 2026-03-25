-- ============================================================
-- Таблиця прогнозів для «Крафтова пекарня»
-- Python AI-моделі записують сюди розрахунки перед відправкою
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bakery_forecasts (
    id                  SERIAL          PRIMARY KEY,
    target_date         DATE            NOT NULL,
    store_id            INTEGER         NOT NULL,
    sku_id              INTEGER         NOT NULL,
    predicted_demand    FLOAT           NOT NULL DEFAULT 0,   -- чистий прогноз від моделі
    oos_count           INTEGER         NOT NULL DEFAULT 0,   -- кількість OOS за останні 3 тижні
    oos_correction      INTEGER         NOT NULL DEFAULT 0,   -- поправка: +1 якщо oos_count >= 2
    production_order    INTEGER         NOT NULL DEFAULT 0,   -- загальний об'єм виробництва по SKU на мережу
    final_distribution  INTEGER         NOT NULL DEFAULT 0,   -- фінальна кількість до відвантаження в магазин
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    UNIQUE (target_date, store_id, sku_id)
);

-- Індекси для типових запитів
CREATE INDEX IF NOT EXISTS idx_bakery_forecasts_date
    ON public.bakery_forecasts (target_date);

CREATE INDEX IF NOT EXISTS idx_bakery_forecasts_date_store
    ON public.bakery_forecasts (target_date, store_id);

-- RLS: дозволяємо читання для аутентифікованих користувачів
ALTER TABLE public.bakery_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read forecasts"
    ON public.bakery_forecasts
    FOR SELECT
    USING (true);

CREATE POLICY "Service role can write forecasts"
    ON public.bakery_forecasts
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.bakery_forecasts IS
    'Прогнози попиту та плани розподілу продукції по магазинах (заповнює Python AI pipeline)';
