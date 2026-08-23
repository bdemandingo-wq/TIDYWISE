-- Column-level revoke of Stripe credentials from client roles,
-- matching the existing pattern used for openphone_api_key / resend_api_key.
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM authenticated;
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon;
REVOKE UPDATE (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM authenticated;
REVOKE UPDATE (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon;

GRANT ALL ON public.org_stripe_settings TO service_role;