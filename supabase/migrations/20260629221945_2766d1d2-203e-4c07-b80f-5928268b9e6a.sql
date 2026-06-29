
-- Revoke broad SELECT and re-grant only on non-sensitive columns
-- org_ghl_settings: hide auth_token
REVOKE SELECT ON public.org_ghl_settings FROM authenticated, anon;
GRANT SELECT (id, organization_id, enabled, webhook_url, auth_header_name, event_config, created_at, updated_at)
  ON public.org_ghl_settings TO authenticated;

-- org_stripe_settings: hide stripe_secret_key, stripe_access_token, stripe_refresh_token
REVOKE SELECT ON public.org_stripe_settings FROM authenticated, anon;
GRANT SELECT (id, organization_id, stripe_publishable_key, stripe_account_id, is_connected, connected_at, created_at, updated_at, stripe_user_email, stripe_display_name, stripe_payouts_enabled, stripe_default_currency)
  ON public.org_stripe_settings TO authenticated;

-- service_role retains full access for edge functions
GRANT ALL ON public.org_ghl_settings TO service_role;
GRANT ALL ON public.org_stripe_settings TO service_role;
