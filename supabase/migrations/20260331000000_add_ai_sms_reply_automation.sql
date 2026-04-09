-- Add AI SMS reply automation type for all existing organizations
INSERT INTO public.organization_automations (organization_id, automation_type, is_enabled, description)
SELECT id, 'ai_sms_reply', false, 'AI auto-reply to incoming SMS messages in your communication style'
FROM public.organizations
ON CONFLICT (organization_id, automation_type) DO NOTHING;

-- Also insert for any future new orgs via the existing trigger pattern
-- (the existing new-org trigger will need to be updated separately if needed)
