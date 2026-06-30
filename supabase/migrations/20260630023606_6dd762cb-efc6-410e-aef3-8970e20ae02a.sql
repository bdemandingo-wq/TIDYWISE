-- Lock down secret columns at the column level so they cannot be SELECTed
-- via PostgREST even by users who pass the row-level SELECT policy. Inserts
-- and updates still work because UPDATE/INSERT privileges remain.
--
-- Frontend already treats these as write-only:
--   * GHLSettingsCard never reads auth_token
--   * SMSSettingsCard uses has_openphone_api_key() RPC instead of selecting the column
--   * No frontend code reads stripe_secret_key / stripe_access_token / stripe_refresh_token
--     (Stripe operations run server-side in edge functions with service_role).

-- 1. GoHighLevel auth token
REVOKE SELECT (auth_token) ON public.org_ghl_settings FROM anon, authenticated;

-- 2. Stripe secrets
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon, authenticated;

-- 3. OpenPhone API key + external webhook secret
REVOKE SELECT (openphone_api_key, external_booking_webhook_secret)
  ON public.organization_sms_settings FROM anon, authenticated;

-- service_role keeps full access (edge functions use it for real work).
GRANT ALL ON public.org_ghl_settings TO service_role;
GRANT ALL ON public.org_stripe_settings TO service_role;
GRANT ALL ON public.organization_sms_settings TO service_role;