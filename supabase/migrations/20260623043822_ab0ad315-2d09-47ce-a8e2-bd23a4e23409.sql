REVOKE SELECT ON public.organization_sms_settings FROM authenticated;
REVOKE SELECT ON public.organization_sms_settings FROM anon;
GRANT SELECT
  (id, organization_id, openphone_phone_number_id, sms_enabled,
   sms_booking_confirmation, sms_appointment_reminder, reminder_hours_before,
   created_at, updated_at, notify_admin_on_the_way, notify_client_on_the_way,
   notify_client_distance_eta, notify_admin_arrived, notify_client_arrived,
   sms_post_booking_upsell, external_booking_webhook_secret)
  ON public.organization_sms_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organization_sms_settings TO authenticated;
GRANT ALL ON public.organization_sms_settings TO service_role;