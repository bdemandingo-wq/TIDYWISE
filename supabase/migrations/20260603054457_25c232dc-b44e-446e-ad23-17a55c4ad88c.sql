
-- Lock down sensitive credential columns by revoking SELECT at the column level.
-- RLS still controls row visibility; column-level grants control which columns
-- the Data API can return. Service role retains full access for edge functions.

-- 1) client_portal_users.password_hash
REVOKE SELECT (password_hash) ON public.client_portal_users FROM anon, authenticated;

-- 2) org_gmail_connections tokens
REVOKE SELECT (access_token, refresh_token_encrypted) ON public.org_gmail_connections FROM anon, authenticated;

-- 3) organization_sms_settings.openphone_api_key
REVOKE SELECT (openphone_api_key) ON public.organization_sms_settings FROM anon, authenticated;

-- Helper RPC so the UI can check whether an OpenPhone API key is configured
-- without ever reading the key value.
CREATE OR REPLACE FUNCTION public.has_openphone_api_key(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_sms_settings
    WHERE organization_id = _org_id
      AND openphone_api_key IS NOT NULL
      AND openphone_api_key <> ''
  ) AND public.is_org_admin(_org_id);
$$;

GRANT EXECUTE ON FUNCTION public.has_openphone_api_key(uuid) TO authenticated;

-- Storage policies for private buckets that previously had none.
-- Files are stored under "<organization_id>/..." path prefix; access is
-- restricted to members of that organization.

-- supply-pictures bucket
CREATE POLICY "Org members can read supply pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'supply-pictures'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org admins can upload supply pictures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'supply-pictures'
  AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org admins can update supply pictures"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'supply-pictures'
  AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org admins can delete supply pictures"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'supply-pictures'
  AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
);

-- work-photos bucket
CREATE POLICY "Org members can read work photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'work-photos'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members can upload work photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'work-photos'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members can update work photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'work-photos'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org admins can delete work photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'work-photos'
  AND public.is_org_admin(((storage.foldername(name))[1])::uuid)
);
