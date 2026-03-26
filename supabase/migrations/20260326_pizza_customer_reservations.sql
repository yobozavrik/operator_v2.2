CREATE TABLE IF NOT EXISTS pizza1.customer_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_date date NOT NULL,
    category text NOT NULL DEFAULT 'pizza',
    customer_name text NOT NULL CHECK (char_length(trim(customer_name)) > 0),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    confirmed_by text,
    confirmed_at timestamptz,
    CONSTRAINT pizza_customer_reservations_category_check CHECK (category = 'pizza')
);

CREATE INDEX IF NOT EXISTS idx_pizza_customer_reservations_date
    ON pizza1.customer_reservations (reservation_date DESC);

CREATE INDEX IF NOT EXISTS idx_pizza_customer_reservations_status
    ON pizza1.customer_reservations (status);

CREATE TABLE IF NOT EXISTS pizza1.customer_reservation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL REFERENCES pizza1.customer_reservations(id) ON DELETE CASCADE,
    sku text NOT NULL,
    qty integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pizza_customer_reservation_items_qty_check CHECK (qty > 0),
    CONSTRAINT pizza_customer_reservation_items_unique_sku UNIQUE (reservation_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_pizza_customer_reservation_items_reservation
    ON pizza1.customer_reservation_items (reservation_id);

CREATE OR REPLACE FUNCTION pizza1.set_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pizza_customer_reservations_updated_at ON pizza1.customer_reservations;
CREATE TRIGGER trg_pizza_customer_reservations_updated_at
BEFORE UPDATE ON pizza1.customer_reservations
FOR EACH ROW
EXECUTE FUNCTION pizza1.set_timestamp_updated_at();

DROP TRIGGER IF EXISTS trg_pizza_customer_reservation_items_updated_at ON pizza1.customer_reservation_items;
CREATE TRIGGER trg_pizza_customer_reservation_items_updated_at
BEFORE UPDATE ON pizza1.customer_reservation_items
FOR EACH ROW
EXECUTE FUNCTION pizza1.set_timestamp_updated_at();
