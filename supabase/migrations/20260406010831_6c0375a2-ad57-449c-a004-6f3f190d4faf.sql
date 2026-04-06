CREATE OR REPLACE FUNCTION public.auto_activate_customer_on_booking()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Only mark customer as active when a booking is actually completed
  IF NEW.customer_id IS NOT NULL AND NEW.status = 'completed' THEN
    UPDATE public.customers
    SET customer_status = 'active'
    WHERE id = NEW.customer_id
      AND customer_status != 'active';
  END IF;
  RETURN NEW;
END;
$$;