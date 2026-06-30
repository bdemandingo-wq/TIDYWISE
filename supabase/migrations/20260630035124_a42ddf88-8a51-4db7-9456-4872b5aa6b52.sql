-- Restrict sensitive column access for authenticated users on three tables
-- while preserving full service_role access.

-- 1. org_ghl_settings: hide auth_token from authenticated
REVOKE SELECT ON public.org_ghl_settings FROM authenticated;
GRANT SELECT (
  id, organization_id, enabled, webhook_url, auth_header_name, event_config,
  created_at, updated_at
) ON public.org_ghl_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_ghl_settings TO authenticated;

-- 2. org_stripe_settings: hide stripe_secret_key, stripe_access_token, stripe_refresh_token from authenticated
REVOKE SELECT ON public.org_stripe_settings FROM authenticated;
GRANT SELECT (
  id, organization_id, is_connected, connected_at, stripe_account_id,
  stripe_publishable_key, stripe_payouts_enabled, stripe_default_currency,
  stripe_display_name, stripe_user_email, created_at, updated_at
) ON public.org_stripe_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_stripe_settings TO authenticated;

-- 3. organization_sms_settings: hide openphone_api_key and external_booking_webhook_secret from authenticated
REVOKE SELECT ON public.organization_sms_settings FROM authenticated;
GRANT SELECT (
  id, organization_id, openphone_phone_number_id, sms_enabled,
  sms_booking_confirmation, sms_appointment_reminder, sms_post_booking_upsell,
  reminder_hours_before, notify_admin_on_the_way, notify_admin_arrived,
  notify_client_on_the_way, notify_client_arrived, notify_client_distance_eta,
  created_at, updated_at
) ON public.organization_sms_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organization_sms_settings TO authenticated;

-- Ensure service_role retains full access on all three tables
GRANT ALL ON public.org_ghl_settings TO service_role;
GRANT ALL ON public.org_stripe_settings TO service_role;
GRANT ALL ON public.organization_sms_settings TO service_role;