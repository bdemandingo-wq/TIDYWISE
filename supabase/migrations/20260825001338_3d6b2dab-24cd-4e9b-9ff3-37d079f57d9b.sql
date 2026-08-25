-- Column-level lockdown of Stripe secrets on org_stripe_settings.
-- Frontend already reads this table exclusively through the
-- get_org_stripe_settings_safe() SECURITY DEFINER RPC; edge functions use
-- service_role. So no client path loses anything.

REVOKE SELECT, INSERT, UPDATE ON public.org_stripe_settings FROM anon, authenticated;

GRANT SELECT (
  id, organization_id, stripe_publishable_key, stripe_account_id, is_connected,
  connected_at, created_at, updated_at, stripe_user_email, stripe_display_name,
  stripe_payouts_enabled, stripe_default_currency
) ON public.org_stripe_settings TO authenticated;

GRANT INSERT (
  id, organization_id, stripe_publishable_key, stripe_account_id, is_connected,
  connected_at, created_at, updated_at, stripe_user_email, stripe_display_name,
  stripe_payouts_enabled, stripe_default_currency
) ON public.org_stripe_settings TO authenticated;

GRANT UPDATE (
  stripe_publishable_key, stripe_account_id, is_connected, connected_at,
  updated_at, stripe_user_email, stripe_display_name, stripe_payouts_enabled,
  stripe_default_currency
) ON public.org_stripe_settings TO authenticated;

GRANT ALL ON public.org_stripe_settings TO service_role;