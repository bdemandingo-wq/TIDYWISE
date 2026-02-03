-- Update the create_booking_from_request function to auto-fill from customer's last booking
CREATE OR REPLACE FUNCTION public.create_booking_from_request(
  p_request_id uuid, 
  p_organization_id uuid, 
  p_customer_id uuid, 
  p_service_id uuid, 
  p_scheduled_at timestamp with time zone, 
  p_duration integer DEFAULT 120
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking_id UUID;
  v_last_booking RECORD;
  v_service_price NUMERIC := 0;
  v_duration INTEGER;
  v_staff_id UUID;
  v_address TEXT;
  v_apt_suite TEXT;
  v_city TEXT;
  v_state TEXT;
  v_zip_code TEXT;
  v_bedrooms TEXT;
  v_bathrooms TEXT;
  v_square_footage TEXT;
  v_extras JSONB;
  v_notes TEXT;
  v_cleaner_wage NUMERIC;
  v_cleaner_wage_type TEXT;
  v_location_id UUID;
  v_total_amount NUMERIC;
BEGIN
  -- Try to get the customer's last completed or confirmed booking for this organization
  SELECT 
    b.staff_id,
    b.duration,
    b.address,
    b.apt_suite,
    b.city,
    b.state,
    b.zip_code,
    b.bedrooms,
    b.bathrooms,
    b.square_footage,
    b.extras,
    b.notes,
    b.cleaner_wage,
    b.cleaner_wage_type,
    b.location_id,
    b.total_amount,
    b.service_id
  INTO v_last_booking
  FROM bookings b
  WHERE b.customer_id = p_customer_id
    AND b.organization_id = p_organization_id
    AND b.status IN ('completed', 'confirmed')
  ORDER BY b.scheduled_at DESC
  LIMIT 1;

  -- If we have a last booking, use its details
  IF v_last_booking IS NOT NULL THEN
    v_staff_id := v_last_booking.staff_id;
    v_duration := COALESCE(v_last_booking.duration, p_duration);
    v_address := v_last_booking.address;
    v_apt_suite := v_last_booking.apt_suite;
    v_city := v_last_booking.city;
    v_state := v_last_booking.state;
    v_zip_code := v_last_booking.zip_code;
    v_bedrooms := v_last_booking.bedrooms;
    v_bathrooms := v_last_booking.bathrooms;
    v_square_footage := v_last_booking.square_footage;
    v_extras := v_last_booking.extras;
    v_notes := v_last_booking.notes;
    v_cleaner_wage := v_last_booking.cleaner_wage;
    v_cleaner_wage_type := v_last_booking.cleaner_wage_type;
    v_location_id := v_last_booking.location_id;
    v_total_amount := v_last_booking.total_amount;
    
    -- Use the service from request if provided, otherwise from last booking
    IF p_service_id IS NULL AND v_last_booking.service_id IS NOT NULL THEN
      -- Keep the last booking's service
      NULL;
    END IF;
  ELSE
    -- Fallback to customer's primary address
    SELECT address, city, state, zip_code
    INTO v_address, v_city, v_state, v_zip_code
    FROM customers
    WHERE id = p_customer_id;
    
    v_duration := p_duration;
  END IF;

  -- Get service price if service is provided (override from last booking)
  IF p_service_id IS NOT NULL THEN
    SELECT base_price, duration 
    INTO v_service_price, v_duration
    FROM services
    WHERE id = p_service_id;
    
    v_service_price := COALESCE(v_service_price, 0);
    v_duration := COALESCE(v_duration, p_duration, 120);
  END IF;

  -- Use last booking's total if we have it and no new service price
  IF v_total_amount IS NOT NULL AND (v_service_price = 0 OR v_service_price IS NULL) THEN
    v_service_price := v_total_amount;
  END IF;

  -- Create the booking with all the auto-filled details
  INSERT INTO bookings (
    organization_id,
    customer_id,
    service_id,
    staff_id,
    scheduled_at,
    duration,
    status,
    payment_status,
    total_amount,
    address,
    apt_suite,
    city,
    state,
    zip_code,
    bedrooms,
    bathrooms,
    square_footage,
    extras,
    notes,
    cleaner_wage,
    cleaner_wage_type,
    location_id
  ) VALUES (
    p_organization_id,
    p_customer_id,
    COALESCE(p_service_id, v_last_booking.service_id),
    v_staff_id,
    p_scheduled_at,
    v_duration,
    'confirmed',
    'pending',
    COALESCE(v_service_price, 0),
    v_address,
    v_apt_suite,
    v_city,
    v_state,
    v_zip_code,
    v_bedrooms,
    v_bathrooms,
    v_square_footage,
    v_extras,
    v_notes,
    v_cleaner_wage,
    v_cleaner_wage_type,
    v_location_id
  )
  RETURNING id INTO v_booking_id;

  -- If last booking had team assignments, copy them too
  IF v_last_booking IS NOT NULL THEN
    INSERT INTO booking_team_assignments (booking_id, staff_id, organization_id, is_primary, pay_share)
    SELECT 
      v_booking_id,
      bta.staff_id,
      p_organization_id,
      bta.is_primary,
      bta.pay_share
    FROM booking_team_assignments bta
    JOIN bookings b ON b.id = bta.booking_id
    WHERE b.customer_id = p_customer_id
      AND b.organization_id = p_organization_id
      AND b.status IN ('completed', 'confirmed')
    ORDER BY b.scheduled_at DESC
    LIMIT 10;  -- Get team from most recent booking only (using subquery limit pattern)
  END IF;

  RETURN v_booking_id;
END;
$function$;