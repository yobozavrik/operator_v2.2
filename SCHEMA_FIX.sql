-- SQL Fix for Owner Dashboard (executive schema)
-- Run this in your Supabase SQL Editor to resolve 500 errors on the Owner page.

-- 1. Create the executive schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS executive;

-- 2. Create the owner_dashboard table
CREATE TABLE IF NOT EXISTS executive.owner_dashboard (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    payload JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Insert initial empty payload if not exists
INSERT INTO executive.owner_dashboard (payload) 
VALUES ('{}'::jsonb) 
ON CONFLICT DO NOTHING;

-- 4. Set permissions for the service_role
ALTER TABLE executive.owner_dashboard OWNER TO postgres;
GRANT ALL ON TABLE executive.owner_dashboard TO service_role;
GRANT ALL ON TABLE executive.owner_dashboard TO postgres;
GRANT USAGE ON SCHEMA executive TO service_role;
GRANT USAGE ON SCHEMA executive TO anon, authenticated;
GRANT SELECT ON executive.owner_dashboard TO authenticated;
