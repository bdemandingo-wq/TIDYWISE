
-- Create a trigger function that auto-syncs bookings with recurring frequency to the recurring_bookings table
CREATE OR REPLACE FUNCTION public.auto_sync_recurring_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_frequency TEXT;
  v_existing_id UUID;
BEGIN
  v_frequency := COALESCE(NEW.frequency, 'one_time');

  -- Skip one-time or empty frequency
  IF v_frequency IN ('one_time', '') OR v_frequency IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if customer_id is null
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if a recurring_bookings entry already exists for this customer+service+org+frequency
  SELECT id INTO v_existing_id
  FROM public.recurring_bookings
  WHERE customer_id = NEW.customer_id
    AND organization_id = NEW.organization_id
    AND COALESCE(service_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.service_id, '00000000-0000-0000-0000-000000000000')
    AND frequency = v_frequency
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update the existing recurring booking with latest details
    UPDATE public.recurring_bookings
    SET staff_id = NEW.staff_id,
        address = NEW.address,
        city = NEW.city,
        state = NEW.state,
        zip_code = NEW.zip_code,
        total_amount = NEW.total_amount,
        bedrooms = NEW.bedrooms,
        bathrooms = NEW.bathrooms,
        square_footage = NEW.square_footage,
        extras = NEW.extras,
        notes = NEW.notes,
        preferred_day = EXTRACT(DOW FROM NEW.scheduled_at)::INTEGER,
        recurring_days_of_week = NEW.recurring_days_of_week,
        next_scheduled_at = NEW.scheduled_at,
        updated_at = NOW()
    WHERE id = v_existing_id;
  ELSE
    -- Create a new recurring booking entry
    INSERT INTO public.recurring_bookings (
      customer_id, service_id, staff_id, organization_id,
      frequency, preferred_day, preferred_time,
      address, city, state, zip_code,
      total_amount, bedrooms, bathrooms, square_footage,
      extras, notes, is_active, next_scheduled_at,
      recurring_days_of_week
    ) VALUES (
      NEW.customer_id, NEW.service_id, NEW.staff_id, NEW.organization_id,
      v_frequency,
      EXTRACT(DOW FROM NEW.scheduled_at)::INTEGER,
      TO_CHAR(NEW.scheduled_at AT TIME ZONE 'UTC', 'HH:MI AM'),
      NEW.address, NEW.city, NEW.state, NEW.zip_code,
      NEW.total_amount, NEW.bedrooms, NEW.bathrooms, NEW.square_footage,
      NEW.extras, NEW.notes, true, NEW.scheduled_at,
      NEW.recurring_days_of_week
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on bookings table for INSERT and UPDATE
CREATE TRIGGER trg_auto_sync_recurring_booking
AFTER INSERT OR UPDATE OF frequency ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.auto_sync_recurring_booking();
