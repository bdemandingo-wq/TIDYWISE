-- =========================================================
-- Critical security fixes (8 issues)
-- =========================================================

-- 1) short_urls: stop blanket public SELECT, expose only via RPC
DROP POLICY IF EXISTS "Anyone can read short URLs by code" ON public.short_urls;

CREATE OR REPLACE FUNCTION public.resolve_short_url(p_code text)
RETURNS TABLE(target_url text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_url, expires_at
  FROM public.short_urls
  WHERE code = p_code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_short_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_short_url(text) TO anon, authenticated;

-- 2) org_gmail_connections: admin-only SELECT (tokens are sensitive)
DROP POLICY IF EXISTS "Org members can view gmail connection" ON public.org_gmail_connections;
CREATE POLICY "Org admins can view gmail connection"
  ON public.org_gmail_connections FOR SELECT
  USING (public.is_org_admin(organization_id));

-- 3) organization_email_settings: admin-only SELECT (Resend API key)
DROP POLICY IF EXISTS "Org members can view email settings" ON public.organization_email_settings;
-- existing "Org admins can manage email settings" (ALL) already covers SELECT for admins

-- 4) client_portal_sessions: restrict UPDATE to org admins (edge functions use service_role and bypass RLS)
DROP POLICY IF EXISTS "Users can update own client sessions" ON public.client_portal_sessions;
CREATE POLICY "Org admins can update client sessions"
  ON public.client_portal_sessions FOR UPDATE
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 5) tax-documents storage: scope admin access to their org's members' files.
-- Path layout: {user_id}/...
DROP POLICY IF EXISTS "Admins or owner can view tax documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins or owner can upload tax documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete tax documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage tax documents" ON storage.objects;

CREATE POLICY "Tax docs: owner or same-org admin can view"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'tax-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.org_memberships admin_m
        JOIN public.org_memberships file_m
          ON file_m.organization_id = admin_m.organization_id
        WHERE admin_m.user_id = auth.uid()
          AND admin_m.role IN ('owner','admin')
          AND file_m.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Tax docs: owner uploads or same-org admin uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tax-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.org_memberships admin_m
        JOIN public.org_memberships file_m
          ON file_m.organization_id = admin_m.organization_id
        WHERE admin_m.user_id = auth.uid()
          AND admin_m.role IN ('owner','admin')
          AND file_m.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Tax docs: same-org admin can delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tax-documents'
    AND EXISTS (
      SELECT 1 FROM public.org_memberships admin_m
      JOIN public.org_memberships file_m
        ON file_m.organization_id = admin_m.organization_id
      WHERE admin_m.user_id = auth.uid()
        AND admin_m.role IN ('owner','admin')
        AND file_m.user_id::text = (storage.foldername(name))[1]
    )
  );

-- 6) staff-documents admin SELECT: scope to same org via path[2] = org_id
DROP POLICY IF EXISTS "Admins can view staff documents" ON storage.objects;
CREATE POLICY "Admins can view staff documents in their org"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'staff-documents'
    AND EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
        AND om.organization_id::text = (storage.foldername(name))[2]
    )
  );

-- 7) Staff signature images SELECT: fix broken alias s.name -> objects.name
DROP POLICY IF EXISTS "Staff can view signature images" ON storage.objects;
CREATE POLICY "Staff can view signature images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = 'signatures'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id::text = (storage.foldername(objects.name))[2]
        AND s.id::text = (storage.foldername(objects.name))[3]
        AND s.is_active = true
    )
  );

-- 8) business-assets UPDATE: scope to org members whose org matches path[1]
DROP POLICY IF EXISTS "Org members can update business assets" ON storage.objects;
CREATE POLICY "Org members can update their business assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'business-assets'
    AND EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'business-assets'
    AND EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );

-- Also tighten INSERT for business-assets (was unscoped)
DROP POLICY IF EXISTS "Org members can upload business assets" ON storage.objects;
CREATE POLICY "Org members can upload to their business assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-assets'
    AND EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );