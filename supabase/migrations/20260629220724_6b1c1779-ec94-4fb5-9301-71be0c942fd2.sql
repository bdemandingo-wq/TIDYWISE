
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon, authenticated;

REVOKE SELECT (openphone_api_key, external_booking_webhook_secret)
  ON public.organization_sms_settings FROM anon, authenticated;
