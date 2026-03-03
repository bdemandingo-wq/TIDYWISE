-- Add "3 Days Before" to appointment reminder intervals
INSERT INTO public.appointment_reminder_intervals (organization_id, label, hours_before, is_active, send_to_client, send_to_cleaner)
SELECT id, '3 Days Before', 72, true, true, false
FROM public.organizations
ON CONFLICT (organization_id, hours_before) DO NOTHING;

-- Update trigger function to ONLY queue review for FIRST completed booking
CREATE OR REPLACE FUNCTION public.queue_review_sms_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_completed_count INTEGER;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    -- Check how many completed bookings this customer has (including this one)
    SELECT COUNT(*) INTO v_completed_count
    FROM public.bookings
    WHERE customer_id = NEW.customer_id
      AND status = 'completed';
      
    -- Only queue if this is the FIRST completed booking (count is 1)
    IF v_completed_count = 1 THEN
      INSERT INTO public.automated_review_sms_queue (booking_id, organization_id, customer_id, send_at)
      VALUES (NEW.id, NEW.organization_id, NEW.customer_id, now() + interval '30 minutes')
      ON CONFLICT (booking_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;