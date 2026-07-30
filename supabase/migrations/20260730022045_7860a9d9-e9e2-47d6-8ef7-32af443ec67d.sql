CREATE OR REPLACE FUNCTION public.enforce_booking_minimum_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min numeric;
BEGIN
  -- Skip 1: nothing to compare against.
  IF NEW.service_id IS NULL OR NEW.total_amount IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip 2: recurring-series bookings. Set only by the admin Recurring Bookings
  -- generator via a real FK; not reachable from the public booking form or any
  -- webhook path.
  IF NEW.recurring_booking_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT min(sp.minimum_price)
    INTO v_min
    FROM public.service_pricing sp
   WHERE sp.service_id = NEW.service_id
     AND sp.organization_id = NEW.organization_id;

  -- Skip 3: no minimum configured for this service in this org.
  IF v_min IS NULL OR v_min <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount < v_min * 0.5 THEN
    RAISE EXCEPTION
      'Booking total % is below the minimum allowed price for this service (minimum %, floor %)',
      NEW.total_amount, v_min, v_min * 0.5
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_minimum_price ON public.bookings;

CREATE TRIGGER trg_enforce_booking_minimum_price
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_minimum_price();