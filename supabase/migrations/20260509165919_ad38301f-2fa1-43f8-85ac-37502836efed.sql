-- ============================================
-- Security hardening: fix 8 errors from scan
-- ============================================

-- 1) Platform admin helper (single source of truth)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) IN (
        'support@tidywisecleaning.com',
        'agencyfootprintllc@gmail.com'
      )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- 2) Client portal: hide password_hash from REST/PostgREST.
-- Keep all-row admin manage policy, but revoke column-level SELECT
-- on the password_hash column for the API roles. RPCs that need it
-- (validate_client_portal_login etc.) are SECURITY DEFINER and unaffected.
REVOKE SELECT (password_hash) ON public.client_portal_users FROM anon, authenticated;

-- 3) account_deletion_requests: restrict SELECT to platform admins
DROP POLICY IF EXISTS "Org admins can view deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Platform admins can view deletion requests"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- 4) facebook_lead_webhook_events: restrict SELECT to platform admins
DROP POLICY IF EXISTS "Only org admins can view webhook events" ON public.facebook_lead_webhook_events;
CREATE POLICY "Platform admins can view fb webhook events"
  ON public.facebook_lead_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- 5) demo_blocked_dates: restrict writes to platform admins
DROP POLICY IF EXISTS "Authenticated users can manage blocked dates" ON public.demo_blocked_dates;
DROP POLICY IF EXISTS "Authenticated users can delete blocked dates" ON public.demo_blocked_dates;
CREATE POLICY "Platform admins can insert blocked dates"
  ON public.demo_blocked_dates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins can delete blocked dates"
  ON public.demo_blocked_dates FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

-- 6) help_videos: restrict writes to platform admins
DROP POLICY IF EXISTS "Org owners can insert help videos" ON public.help_videos;
DROP POLICY IF EXISTS "Org owners can update help videos" ON public.help_videos;
DROP POLICY IF EXISTS "Org owners can delete help videos" ON public.help_videos;
CREATE POLICY "Platform admins can insert help videos"
  ON public.help_videos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins can update help videos"
  ON public.help_videos FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins can delete help videos"
  ON public.help_videos FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

-- 7) get_user_organization_id: deterministic ordering
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.org_memberships
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC, organization_id ASC
  LIMIT 1
$$;

-- 8) Realtime.messages: lock down broadcast/presence channels.
-- Codebase uses only postgres_changes (governed by base-table RLS),
-- so no in-app broadcast/presence channels exist yet. We deny all
-- broadcast/presence access by default and require a future explicit
-- policy if/when broadcast is needed.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny broadcast and presence by default" ON realtime.messages;
CREATE POLICY "Deny broadcast and presence by default"
  ON realtime.messages
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 9) external-booking-webhook per-org secret
ALTER TABLE public.organization_sms_settings
  ADD COLUMN IF NOT EXISTS external_booking_webhook_secret text;

-- Backfill a random secret for any org that already has SMS settings
UPDATE public.organization_sms_settings
SET external_booking_webhook_secret = encode(gen_random_bytes(24), 'hex')
WHERE external_booking_webhook_secret IS NULL;

-- Lookup helper for the edge function (service-role only via SECURITY DEFINER bypass)
CREATE OR REPLACE FUNCTION public.verify_external_booking_secret(_org_id uuid, _secret text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_sms_settings
    WHERE organization_id = _org_id
      AND external_booking_webhook_secret IS NOT NULL
      AND external_booking_webhook_secret = _secret
  )
$$;
REVOKE EXECUTE ON FUNCTION public.verify_external_booking_secret(uuid, text) FROM anon, authenticated;