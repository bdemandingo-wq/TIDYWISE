-- Remove OpenPhone config from the Apple Reviewer test org to prevent cross-org routing
UPDATE public.organization_sms_settings 
SET openphone_api_key = NULL, openphone_phone_number_id = NULL, sms_enabled = false
WHERE organization_id = 'ec639629-81a9-49f5-a9b3-c6a45ebf292f';