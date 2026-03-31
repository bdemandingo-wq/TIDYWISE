CREATE OR REPLACE FUNCTION public.provision_default_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.organization_automations (organization_id, automation_type, is_enabled, description)
  VALUES
    (NEW.id, 'review_request', true, 'Send review request SMS 30 minutes after job completion'),
    (NEW.id, 'appointment_reminder', true, 'Send appointment reminder SMS 24 hours before scheduled cleaning'),
    (NEW.id, 'missed_call_textback', true, 'Auto-reply SMS when a call is missed on the organization phone number'),
    (NEW.id, 'rebooking_reminder', true, 'Send rebooking reminder 28 days after completed cleaning'),
    (NEW.id, 'recurring_upsell', true, 'Send recurring service upsell 2 hours after completed cleaning'),
    (NEW.id, 'winback_60day', true, 'Send win-back message to customers inactive for 60+ days'),
    (NEW.id, 'ai_sms_reply', false, 'AI reads past messages and call transcripts, then replies to incoming SMS in your tone and style')
  ON CONFLICT (organization_id, automation_type) DO NOTHING;

  INSERT INTO public.automated_campaigns (organization_id, name, subject, body, type, is_active, days_inactive)
  VALUES
    (NEW.id, 'Slow Week Availability Fill', 'Slow Week Fill', 'Hi, this is {company_name}. We had a few cleaning spots open this week and are offering priority scheduling to past clients. Want me to reserve one for you? Reply STOP to opt out.', 'custom', true, 30),
    (NEW.id, 'Holiday Cleaning Reminder', 'Holiday Reminder', 'Hi, this is {company_name}. Holiday cleanings book out fast. Want me to lock in your cleaning before spots run out? Reply STOP to opt out.', 'seasonal_promo', true, 0),
    (NEW.id, 'VIP Client Offer', 'VIP Offer', 'Hi, this is {company_name}. We are opening extra cleaning slots for returning clients this week. Want me to reserve one for you? Reply STOP to opt out.', 'custom', true, 0),
    (NEW.id, 'Recurring Service Offer', 'Recurring Offer', 'Hi, this is {company_name}. Clients on recurring service get priority scheduling and lower pricing while never worrying about cleaning again. Want me to lock in a regular cleaning spot for you? Reply STOP to opt out.', 'post_service', true, 0),
    (NEW.id, 'Win-Back 60 Day', 'Win-Back', 'Hi, this is {company_name}. It has been a while since we last cleaned your home. Want me to get you back on the schedule this week? Reply STOP to opt out.', 'win_back', true, 60);

  RETURN NEW;
END;
$function$;