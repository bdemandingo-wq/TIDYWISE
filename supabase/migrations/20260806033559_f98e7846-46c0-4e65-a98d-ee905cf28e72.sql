CREATE OR REPLACE FUNCTION public.enforce_booking_minimum_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Skip 4: an authenticated owner/admin of THIS org is deliberately discounting.
  -- NOTE: intentionally NOT public.is_org_admin() -- that helper also returns
  -- true for 'manager', and managers must remain subject to the floor.
  -- Untrusted paths (public-booking-submit, webhooks) run as service_role where
  -- auth.uid() is NULL, so this never exempts them.
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_memberships m
     WHERE m.organization_id = NEW.organization_id
       AND m.user_id = auth.uid()
       AND m.role IN ('owner', 'admin')
  ) THEN
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
$function$;