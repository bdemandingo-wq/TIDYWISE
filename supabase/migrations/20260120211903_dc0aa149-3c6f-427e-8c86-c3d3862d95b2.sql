-- Add is_recurring flag to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_customers_is_recurring ON public.customers(is_recurring);

-- Add a comment explaining the field
COMMENT ON COLUMN public.customers.is_recurring IS 'Auto-tagged as true when customer has a saved address AND more than one booking per month';

-- Create a function to check and update recurring status
CREATE OR REPLACE FUNCTION public.update_customer_recurring_status()
RETURNS TRIGGER AS $$
DECLARE
  customer_address TEXT;
  bookings_this_month INT;
  has_active_recurring BOOLEAN;
BEGIN
  -- Get the customer's saved address
  SELECT address INTO customer_address
  FROM public.customers
  WHERE id = COALESCE(NEW.customer_id, OLD.customer_id);
  
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
  
  -- Update is_recurring: true if (has address AND >1 booking/month) OR has active recurring booking
  UPDATE public.customers
  SET is_recurring = (
    (customer_address IS NOT NULL AND customer_address != '' AND bookings_this_month > 1)
    OR has_active_recurring
  )
  WHERE id = COALESCE(NEW.customer_id, OLD.customer_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-update recurring status when bookings change
DROP TRIGGER IF EXISTS trigger_update_customer_recurring ON public.bookings;
CREATE TRIGGER trigger_update_customer_recurring
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_recurring_status();

-- Also trigger when recurring_bookings change
DROP TRIGGER IF EXISTS trigger_update_customer_recurring_from_rb ON public.recurring_bookings;
CREATE TRIGGER trigger_update_customer_recurring_from_rb
AFTER INSERT OR UPDATE OR DELETE ON public.recurring_bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_recurring_status();

-- Backfill existing customers based on current data
UPDATE public.customers c
SET is_recurring = true
WHERE (
  -- Has saved address AND multiple bookings this month
  (c.address IS NOT NULL AND c.address != '' AND (
    SELECT COUNT(*) FROM public.bookings b
    WHERE b.customer_id = c.id
    AND b.status != 'cancelled'
    AND DATE_TRUNC('month', b.scheduled_at) = DATE_TRUNC('month', CURRENT_TIMESTAMP)
  ) > 1)
  -- OR has active recurring booking (including Airbnb)
  OR EXISTS (
    SELECT 1 FROM public.recurring_bookings rb
    WHERE rb.customer_id = c.id AND rb.is_active = true
  )
);