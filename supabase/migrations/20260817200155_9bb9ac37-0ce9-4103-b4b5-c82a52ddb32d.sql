-- Stripe secret key and OAuth tokens must never be readable by the client,
-- even for an org owner. Owners keep full read access to every other column;
-- connection status is exposed via has_stripe_secret_key() and
-- get_org_stripe_public_settings(), and edge functions use the service role.
revoke select (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  on public.org_stripe_settings from authenticated;
revoke select (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  on public.org_stripe_settings from anon;