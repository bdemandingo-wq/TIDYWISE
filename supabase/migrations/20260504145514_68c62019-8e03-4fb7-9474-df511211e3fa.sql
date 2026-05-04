CREATE OR REPLACE FUNCTION public.get_org_stripe_secret(p_org_id uuid)
RETURNS TABLE(stripe_secret_key text, stripe_access_token text, stripe_account_id text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 
    oss.stripe_secret_key,
    oss.stripe_access_token,
    oss.stripe_account_id
  FROM public.org_stripe_settings oss
  WHERE oss.organization_id = p_org_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_org_stripe_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_stripe_secret(uuid) TO service_role;