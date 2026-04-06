
-- Trigger function: auto-set customer_status to 'active' when a booking is completed or has revenue
CREATE OR REPLACE FUNCTION public.auto_activate_customer_on_booking()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- When a booking is completed or has revenue > 0, mark customer as active
  IF NEW.customer_id IS NOT NULL AND (
    NEW.status = 'completed' OR NEW.total_amount > 0
  ) THEN
    UPDATE public.customers
    SET customer_status = 'active'
    WHERE id = NEW.customer_id
      AND customer_status != 'active';
  END IF;
  RETURN NEW;
END;
$$;

-- Fire on INSERT and UPDATE of bookings
DROP TRIGGER IF EXISTS trg_auto_activate_customer ON public.bookings;
CREATE TRIGGER trg_auto_activate_customer
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_activate_customer_on_booking();

-- Backfill: set all existing customers with completed bookings or revenue to 'active'
UPDATE public.customers c
SET customer_status = 'active'
WHERE customer_status != 'active'
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.customer_id = c.id
      AND (b.status = 'completed' OR b.total_amount > 0)
  );
