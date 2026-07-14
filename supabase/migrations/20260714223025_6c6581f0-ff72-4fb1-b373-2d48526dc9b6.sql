CREATE OR REPLACE FUNCTION public.enforce_booking_notice_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_tz TEXT;
  v_today DATE;
  v_booking_date DATE;
BEGIN
  IF NEW.organization_id <> 'e95b92d0-7099-408e-a773-e4407b34f8b4' THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at THEN
    RETURN NEW;
  END IF;

  SELECT timezone INTO v_org_tz
  FROM public.business_settings
  WHERE organization_id = NEW.organization_id;

  v_org_tz := COALESCE(v_org_tz, 'America/New_York');
  v_today := (now() AT TIME ZONE v_org_tz)::date;
  v_booking_date := (NEW.scheduled_at AT TIME ZONE v_org_tz)::date;

  IF v_booking_date = v_today OR v_booking_date = v_today + 1 THEN
    RAISE EXCEPTION 'Bookings must be scheduled at least 2 days in advance (no same-day or next-day bookings).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;