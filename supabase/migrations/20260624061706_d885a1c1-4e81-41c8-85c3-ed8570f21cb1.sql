
-- Lock OpenPhone API key and webhook secret to service_role only
REVOKE SELECT (openphone_api_key, external_booking_webhook_secret) ON public.organization_sms_settings FROM anon, authenticated;

-- Lock staff PII fields to service_role only
REVOKE SELECT (ssn_last4, ein, tax_document_url) ON public.staff FROM anon, authenticated;
