
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS review_request_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;

-- Backfill: anyone who already has a review_requests row should be marked
UPDATE public.customers c
SET review_request_sent = true,
    review_request_sent_at = COALESCE(c.review_request_sent_at, sub.first_sent)
FROM (
  SELECT customer_id, MIN(sent_at) AS first_sent
  FROM public.review_requests
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id
  AND c.review_request_sent = false;

-- Replace trigger function with stricter rules
CREATE OR REPLACE FUNCTION public.queue_review_sms_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_other_completed INTEGER;
  v_total_bookings INTEGER;
  v_already_sent BOOLEAN;
  v_is_one_time BOOLEAN;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.customer_id IS NOT NULL THEN

    -- Skip if this customer has ever already been sent a review request
    SELECT COALESCE(review_request_sent, false) INTO v_already_sent
    FROM public.customers
    WHERE id = NEW.customer_id;

    IF v_already_sent THEN
      RETURN NEW;
    END IF;

    -- Only one-time bookings qualify
    v_is_one_time := COALESCE(NEW.frequency, 'one-time') IN ('one-time', 'one_time');
    IF NOT v_is_one_time THEN
      RETURN NEW;
    END IF;

    -- Customer must have no OTHER completed bookings (this is their first ever)
    SELECT COUNT(*) INTO v_other_completed
    FROM public.bookings
    WHERE customer_id = NEW.customer_id
      AND status = 'completed'
      AND id <> NEW.id;

    IF v_other_completed > 0 THEN
      RETURN NEW;
    END IF;

    -- Customer must not have multiple bookings on file (recurring client signal)
    SELECT COUNT(*) INTO v_total_bookings
    FROM public.bookings
    WHERE customer_id = NEW.customer_id
      AND COALESCE(frequency, 'one-time') NOT IN ('one-time', 'one_time');

    IF v_total_bookings > 0 THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.automated_review_sms_queue (booking_id, organization_id, customer_id, send_at)
    VALUES (NEW.id, NEW.organization_id, NEW.customer_id, now() + interval '30 minutes')
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
