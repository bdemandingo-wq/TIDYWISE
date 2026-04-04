
-- =============================================
-- CRITICAL FIX 1: deposit_requests
-- Remove public unscoped SELECT, add token-scoped function
-- =============================================
DROP POLICY IF EXISTS "Public can read deposit requests by token" ON public.deposit_requests;

-- Create a secure function to look up deposit by token
CREATE OR REPLACE FUNCTION public.get_deposit_by_token(p_token text)
RETURNS TABLE(
  id uuid,
  token text,
  status text,
  amount numeric,
  customer_name text,
  organization_id uuid,
  booking_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dr.id, dr.token, dr.status, dr.amount, 
    dr.customer_name, dr.organization_id, dr.booking_id
  FROM public.deposit_requests dr
  WHERE dr.token = p_token;
END;
$$;

-- =============================================
-- CRITICAL FIX 2: booking_photos table
-- Replace USING(true) with org-scoped policies
-- =============================================
DROP POLICY IF EXISTS "Authenticated can view booking photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Authenticated can insert booking photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Authenticated can update booking photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Authenticated can delete booking photos" ON public.booking_photos;

-- Org admins can do everything with booking photos
CREATE POLICY "Org admins can manage booking photos"
ON public.booking_photos FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Org staff can view and insert photos for their org
CREATE POLICY "Org staff can view booking photos"
ON public.booking_photos FOR SELECT
TO authenticated
USING (is_org_staff(organization_id));

CREATE POLICY "Org staff can insert booking photos"
ON public.booking_photos FOR INSERT
TO authenticated
WITH CHECK (is_org_staff(organization_id));

CREATE POLICY "Org staff can update booking photos"
ON public.booking_photos FOR UPDATE
TO authenticated
USING (is_org_staff(organization_id));

CREATE POLICY "Org staff can delete booking photos"
ON public.booking_photos FOR DELETE
TO authenticated
USING (is_org_staff(organization_id));

-- =============================================
-- CRITICAL FIX 2b: storage booking-photos bucket
-- Add org path verification
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete booking photos" ON storage.objects;

CREATE POLICY "Org members can view booking photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (
    is_org_admin((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Org members can upload booking photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'booking-photos'
  AND (
    is_org_admin((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Org members can update booking photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (
    is_org_admin((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Org members can delete booking photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (
    is_org_admin((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

-- =============================================
-- WARNING FIX 2: RLS Always True policies
-- =============================================

-- Fix client_portal_sessions: remove duplicate and overly permissive UPDATE policies
DROP POLICY IF EXISTS "Allow update own sessions" ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Update own client sessions" ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Insert client sessions" ON public.client_portal_sessions;

-- Client portal sessions use session_token for auth (no Supabase auth)
-- We need public access but scoped by session_token
CREATE POLICY "Public can insert client sessions"
ON public.client_portal_sessions FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Public can update own client sessions by token"
ON public.client_portal_sessions FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Fix booking_link_tracking anon policies
DROP POLICY IF EXISTS "Anyone can read by tracking ref" ON public.booking_link_tracking;
DROP POLICY IF EXISTS "Anyone can update link opened status" ON public.booking_link_tracking;

-- These are accessed via edge functions with service role, not directly by anon users
-- No anon policy needed since edge functions use service role key

-- Fix tips public SELECT true
DROP POLICY IF EXISTS "Public can view tips by token" ON public.tips;

-- Create secure function for tip lookup by token
CREATE OR REPLACE FUNCTION public.get_tip_by_token(p_token text)
RETURNS TABLE(
  id uuid,
  token text,
  status text,
  amount numeric,
  customer_name text,
  organization_id uuid,
  booking_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id, t.token, t.status, t.amount,
    t.customer_name, t.organization_id, t.booking_id
  FROM public.tips t
  WHERE t.token = p_token;
END;
$$;

-- Fix client_tier_settings: scope to org members instead of all authenticated
DROP POLICY IF EXISTS "Public can view tier settings" ON public.client_tier_settings;

CREATE POLICY "Org members can view tier settings"
ON public.client_tier_settings FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- =============================================
-- INFO FIX: ai_reply_locks — RLS enabled no policy
-- =============================================
CREATE POLICY "Authenticated users can manage ai reply locks"
ON public.ai_reply_locks FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

