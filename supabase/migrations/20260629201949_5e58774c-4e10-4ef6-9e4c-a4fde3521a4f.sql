
REVOKE SELECT ON public.org_stripe_settings FROM anon, authenticated;

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

GRANT INSERT, UPDATE, DELETE ON public.org_stripe_settings TO authenticated;
GRANT ALL ON public.org_stripe_settings TO service_role;

CREATE OR REPLACE FUNCTION public.org_stripe_has_secrets(_org_id uuid)
RETURNS TABLE (
  has_secret_key boolean,
  has_access_token boolean,
  has_refresh_token boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (stripe_secret_key IS NOT NULL AND length(stripe_secret_key) > 0),
    (stripe_access_token IS NOT NULL AND length(stripe_access_token) > 0),
    (stripe_refresh_token IS NOT NULL AND length(stripe_refresh_token) > 0)
  FROM public.org_stripe_settings
  WHERE organization_id = _org_id
    AND public.is_org_admin(_org_id)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.org_stripe_has_secrets(uuid) TO authenticated;
