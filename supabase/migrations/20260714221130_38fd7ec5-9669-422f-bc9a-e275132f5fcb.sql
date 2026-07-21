
-- Revoke direct SELECT on secret columns of org_stripe_settings from client roles.
REVOKE SELECT ON public.org_stripe_settings FROM anon, authenticated;

-- Grant SELECT only on non-secret columns needed by the client.
GRANT SELECT (
  id,
  organization_id,
  stripe_publishable_key,
  stripe_account_id,
  is_connected,
  connected_at,
  created_at,
  updated_at,
  stripe_user_email,
  stripe_display_name,
  stripe_payouts_enabled,
  stripe_default_currency
) ON public.org_stripe_settings TO authenticated;

-- Keep insert/update/delete governed by existing RLS policies.
GRANT INSERT, UPDATE, DELETE ON public.org_stripe_settings TO authenticated;
GRANT ALL ON public.org_stripe_settings TO service_role;

-- Presence check RPC, mirroring has_openphone_api_key / has_resend_api_key pattern.
CREATE OR REPLACE FUNCTION public.has_stripe_secret_key(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_stripe_settings s
    WHERE s.organization_id = _organization_id
      AND (
        (s.stripe_secret_key IS NOT NULL AND length(s.stripe_secret_key) > 0)
        OR (s.stripe_access_token IS NOT NULL AND length(s.stripe_access_token) > 0)
      )
      AND public.is_org_admin(auth.uid(), _organization_id)
  );
$$;

REVOKE ALL ON FUNCTION public.has_stripe_secret_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_stripe_secret_key(uuid) TO authenticated;
