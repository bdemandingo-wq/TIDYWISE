
-- Reaffirm column-level lockdown on the GHL auth token
REVOKE SELECT (auth_token) ON public.org_ghl_settings FROM anon, authenticated;

-- Safe accessor: returns non-sensitive fields + a configured/not-configured flag
CREATE OR REPLACE FUNCTION public.get_org_ghl_settings_safe(_organization_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  enabled boolean,
  webhook_url text,
  auth_header_name text,
  event_config jsonb,
  auth_token_configured boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins/owners of the org may read these settings
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_memberships m
    WHERE m.organization_id = _organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to read GHL settings for this organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.organization_id,
    s.enabled,
    s.webhook_url,
    s.auth_header_name,
    s.event_config,
    (s.auth_token IS NOT NULL AND length(btrim(s.auth_token)) > 0) AS auth_token_configured,
    s.created_at,
    s.updated_at
  FROM public.org_ghl_settings s
  WHERE s.organization_id = _organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_ghl_settings_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_ghl_settings_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_ghl_settings_safe(uuid) TO service_role;
