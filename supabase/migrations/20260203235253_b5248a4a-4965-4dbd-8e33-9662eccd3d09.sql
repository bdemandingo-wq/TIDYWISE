-- Fix the create_booking_from_request function - correct column name is 'price' not 'base_price'
CREATE OR REPLACE FUNCTION public.create_booking_from_request(
  p_request_id UUID,
  p_organization_id UUID,
  p_customer_id UUID,
  p_service_id UUID,
  p_scheduled_at TIMESTAMPTZ,
  p_duration INTEGER DEFAULT 120
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_last_booking_id UUID;
  v_staff_id UUID;
  v_duration INTEGER;
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
  v_last_service_id UUID;
  v_service_price NUMERIC := 0;
  v_found_last_booking BOOLEAN := FALSE;
BEGIN
  -- Try to get the customer's last completed or confirmed booking for this organization
  SELECT 
    b.id,
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
  INTO 
    v_last_booking_id,
    v_staff_id,
    v_duration,
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
    v_location_id,
    v_total_amount,
    v_last_service_id
  FROM bookings b
  WHERE b.customer_id = p_customer_id
    AND b.organization_id = p_organization_id
    AND b.status IN ('completed', 'confirmed')
  ORDER BY b.scheduled_at DESC
  LIMIT 1;

  -- Check if we found a previous booking (v_last_booking_id will be non-null if found)
  IF v_last_booking_id IS NOT NULL THEN
    v_found_last_booking := TRUE;
    -- Use the duration from last booking if not overridden
    v_duration := COALESCE(v_duration, p_duration);
  ELSE
    -- Fallback to customer's primary address from their profile
    SELECT c.address, c.city, c.state, c.zip_code
    INTO v_address, v_city, v_state, v_zip_code
    FROM customers c
    WHERE c.id = p_customer_id;
    
    v_duration := p_duration;
  END IF;

  -- Get service price and duration if a service is provided (use 'price' column, not 'base_price')
  IF p_service_id IS NOT NULL THEN
    SELECT price, duration 
    INTO v_service_price, v_duration
    FROM services
    WHERE id = p_service_id;
    
    v_service_price := COALESCE(v_service_price, 0);
    v_duration := COALESCE(v_duration, p_duration, 120);
  ELSIF v_last_service_id IS NOT NULL THEN
    -- Use last booking's service if no new service specified
    SELECT price, duration 
    INTO v_service_price, v_duration
    FROM services
    WHERE id = v_last_service_id;
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
    COALESCE(p_service_id, v_last_service_id),
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

  -- If we found a previous booking, also copy over the team assignments
  IF v_found_last_booking THEN
    INSERT INTO booking_team_assignments (booking_id, staff_id, is_primary, pay_share, organization_id)
    SELECT v_booking_id, bta.staff_id, bta.is_primary, bta.pay_share, bta.organization_id
    FROM booking_team_assignments bta
    WHERE bta.booking_id = v_last_booking_id;
  END IF;

  RETURN v_booking_id;
END;
$$;