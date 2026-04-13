
-- 1) Drop the overly-permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can view tracking by token" ON public.cleaner_location_tracking;

-- 2) Admins can view their org's tracking
CREATE POLICY "Org admins can view tracking"
  ON public.cleaner_location_tracking
  FOR SELECT
  USING (public.is_org_admin(organization_id));

-- 3) Staff can view their own tracking
CREATE POLICY "Staff can view own tracking"
  ON public.cleaner_location_tracking
  FOR SELECT
  USING (public.is_org_staff(organization_id));

-- 4) Trigger to auto-deactivate tracking when booking moves to in_progress or completed
CREATE OR REPLACE FUNCTION public.deactivate_tracking_on_status_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('in_progress', 'completed') AND OLD.status != NEW.status THEN
    UPDATE public.cleaner_location_tracking
    SET is_active = false
    WHERE booking_id = NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deactivate_tracking_on_status
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.deactivate_tracking_on_status_change();
