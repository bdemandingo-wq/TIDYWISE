-- Lock down sensitive columns so they're no longer readable via PostgREST,
-- only accessible from edge functions via service_role.

-- org_ghl_settings.auth_token (GHL webhook auth token)
REVOKE SELECT (auth_token) ON public.org_ghl_settings FROM anon, authenticated;

-- org_stripe_settings: Stripe credentials (secret key, OAuth tokens)
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon, authenticated;

-- organizations.lindy_api_key (Lindy AI integration key)
REVOKE SELECT (lindy_api_key) ON public.organizations FROM anon, authenticated;

-- service_role retains full access (used by edge functions) — no change needed.
