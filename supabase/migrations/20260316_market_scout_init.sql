-- 20260316_market_scout_init.sql
-- Initialization of the Competitive Intelligence module "Розвідник"
-- Using ml_forecasting schema due to RPC restrictions

-- 1. Sources of information
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'instagram', 'telegram', 'website', 'facebook'
    url TEXT,
    is_active BOOLEAN DEFAULT true,
    legal_mode TEXT DEFAULT 'public_tos',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Competitors
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    city TEXT,
    segment TEXT, -- 'premium', 'mass-market', 'local'
    priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Raw Events (Ingested data)
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_raw_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES ml_forecasting.scout_sources(id),
    competitor_id UUID REFERENCES ml_forecasting.scout_competitors(id),
    event_time TIMESTAMPTZ NOT NULL,
    payload_json JSONB,
    url TEXT,
    hash TEXT UNIQUE, -- For dedup
    fetched_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Normalized Events (Processed data)
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_normalized_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_event_id UUID REFERENCES ml_forecasting.scout_raw_events(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'акція', 'новий_sku', 'зміна_ціни', 'контент', 'відгук'
    sku_name TEXT,
    category TEXT,
    promo_type TEXT,
    old_price NUMERIC,
    new_price NUMERIC,
    discount_pct NUMERIC,
    confidence NUMERIC DEFAULT 1.0,
    summary_uk TEXT,
    event_date DATE NOT NULL,
    competitor_id UUID REFERENCES ml_forecasting.scout_competitors(id),
    severity TEXT DEFAULT 'low', -- 'low', 'medium', 'high'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Event Tags
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_event_tags (
    event_id UUID REFERENCES ml_forecasting.scout_normalized_events(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (event_id, tag)
);

-- 6. Alerts
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES ml_forecasting.scout_normalized_events(id) ON DELETE CASCADE,
    severity TEXT NOT NULL,
    status TEXT DEFAULT 'new', -- 'new', 'read', 'archived'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Daily Metrics (Pre-calculated for charts)
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_daily_competitor_metrics (
    date DATE NOT NULL,
    competitor_id UUID REFERENCES ml_forecasting.scout_competitors(id),
    promo_count INTEGER DEFAULT 0,
    new_sku_count INTEGER DEFAULT 0,
    avg_discount NUMERIC DEFAULT 0,
    price_changes_count INTEGER DEFAULT 0,
    PRIMARY KEY (date, competitor_id)
);

-- 8. Recommendations
CREATE TABLE IF NOT EXISTS ml_forecasting.scout_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE DEFAULT CURRENT_DATE,
    text_uk TEXT NOT NULL,
    rationale TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending', -- 'pending', 'implemented', 'ignored'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scout_norm_events_date ON ml_forecasting.scout_normalized_events(event_date);
CREATE INDEX IF NOT EXISTS idx_scout_norm_events_comp ON ml_forecasting.scout_normalized_events(competitor_id);
CREATE INDEX IF NOT EXISTS idx_scout_norm_events_type ON ml_forecasting.scout_normalized_events(event_type);
CREATE INDEX IF NOT EXISTS idx_scout_raw_events_hash ON ml_forecasting.scout_raw_events(hash);
CREATE INDEX IF NOT EXISTS idx_scout_daily_metrics_date ON ml_forecasting.scout_daily_competitor_metrics(date);
