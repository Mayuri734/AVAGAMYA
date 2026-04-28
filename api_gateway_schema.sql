-- SQL to create Multi-Tenant API Registration and Approval tables
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 1. api_tenants table
CREATE TABLE IF NOT EXISTS public.api_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name TEXT NOT NULL,
    admin_name TEXT NOT NULL,
    official_email TEXT NOT NULL UNIQUE,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. api_keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.api_tenants(id) ON DELETE CASCADE,
    hashed_key TEXT NOT NULL, -- Storing SHA-256 hash of the API key
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.api_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Policies for api_tenants:
-- Owners can read their own tenant data
CREATE POLICY "Tenants can view their own data" ON public.api_tenants
    FOR SELECT USING (auth.jwt() ->> 'email' = official_email);

-- Admins can read all pending/approved tenants
-- (This assumes we identify admins by a list of emails for now, or you can refine this)
CREATE POLICY "Admins can view all tenants" ON public.api_tenants
    FOR ALL TO authenticated USING (true); -- Refine this in production

-- Policies for api_keys:
-- Tenants can manage their own keys
CREATE POLICY "Tenants can manage their own keys" ON public.api_keys
    FOR ALL USING (
        tenant_id IN (
            SELECT id FROM public.api_tenants WHERE official_email = auth.jwt() ->> 'email'
        )
    );
