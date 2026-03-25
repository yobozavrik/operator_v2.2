ALTER TABLE bulvar1.production_180d_products
ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'шт',
ADD COLUMN IF NOT EXISTS category_id integer,
ADD COLUMN IF NOT EXISTS category_name text,
ADD COLUMN IF NOT EXISTS poster_weight_flag boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bulvar_prod180_category_id
ON bulvar1.production_180d_products (category_id);
