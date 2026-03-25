-- Migration: executive.supply_invoices
-- Run in Supabase SQL Editor (or via supabase db push)

CREATE SCHEMA IF NOT EXISTS executive;

CREATE TABLE IF NOT EXISTS executive.supply_invoices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'needs_review', 'posted', 'failed')),

    source           text NOT NULL DEFAULT 'upload'
                     CHECK (source IN ('camera', 'upload')),

    source_filename  text,
    source_mime_type text,

    invoice_number   text,
    invoice_date     date,
    supplier_name    text,
    total_amount     numeric(14, 2),
    currency         text NOT NULL DEFAULT 'UAH',

    confidence       numeric(4, 3),

    raw_text         text,
    ocr_payload      jsonb,
    normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

    error_message    text
);

CREATE INDEX IF NOT EXISTS supply_invoices_created_at_idx
    ON executive.supply_invoices (created_at DESC);

CREATE INDEX IF NOT EXISTS supply_invoices_status_idx
    ON executive.supply_invoices (status);

CREATE OR REPLACE FUNCTION executive.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER supply_invoices_updated_at
    BEFORE UPDATE ON executive.supply_invoices
    FOR EACH ROW EXECUTE FUNCTION executive.set_updated_at();

ALTER TABLE executive.supply_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON executive.supply_invoices
    FOR ALL TO service_role USING (true) WITH CHECK (true);
