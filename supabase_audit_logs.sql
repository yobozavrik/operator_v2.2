-- SQL Script to create audit_logs table in Supabase
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries by user and action
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only allow inserts (logs are append-only)
CREATE POLICY "Allow inserts for all" ON public.audit_logs
    FOR INSERT WITH CHECK (true);

-- Policy: Only admins can read logs (you can adjust this)
CREATE POLICY "Allow select for authenticated" ON public.audit_logs
    FOR SELECT USING (true);

COMMENT ON TABLE public.audit_logs IS 'Audit log for tracking all user actions';
