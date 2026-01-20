-- Update the function to be more inclusive for recurring detection
-- A customer is recurring if:
-- 1. They have an active recurring booking (Airbnb/standard recurring)
-- 2. OR they have >1 booking in the current month (frequent cleans)
CREATE OR REPLACE FUNCTION public.update_customer_recurring_status()
RETURNS TRIGGER AS $$
DECLARE
  bookings_this_month INT;
  has_active_recurring BOOLEAN;
BEGIN
  -- Check if customer has active recurring bookings (including Airbnb turnarounds)
  SELECT EXISTS(
    SELECT 1 FROM public.recurring_bookings
    WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
    AND is_active = true
  ) INTO has_active_recurring;
  
  -- Count bookings for this customer in current month
  SELECT COUNT(*) INTO bookings_this_month
  FROM public.bookings
  WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
  AND status != 'cancelled'
  AND DATE_TRUNC('month', scheduled_at) = DATE_TRUNC('month', CURRENT_TIMESTAMP);
  
  -- Update is_recurring: true if >1 booking/month OR has active recurring booking
  UPDATE public.customers
  SET is_recurring = (bookings_this_month > 1 OR has_active_recurring)
  WHERE id = COALESCE(NEW.customer_id, OLD.customer_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-backfill existing customers with updated logic
UPDATE public.customers c
SET is_recurring = (
  -- Has >1 booking this month
  (SELECT COUNT(*) FROM public.bookings b
   WHERE b.customer_id = c.id
   AND b.status != 'cancelled'
   AND DATE_TRUNC('month', b.scheduled_at) = DATE_TRUNC('month', CURRENT_TIMESTAMP)) > 1
  -- OR has active recurring booking (including Airbnb)
  OR EXISTS (
    SELECT 1 FROM public.recurring_bookings rb
    WHERE rb.customer_id = c.id AND rb.is_active = true
  )
);