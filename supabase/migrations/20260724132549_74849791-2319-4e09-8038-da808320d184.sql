-- Revoke client-side SELECT on Stripe secret columns so they cannot be
-- fetched by authenticated or anonymous users. Edge functions still access
-- them via service_role.

REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM authenticated;

REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon;