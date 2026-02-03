-- Fix the create_booking_from_request function to use valid payment_status enum value
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
  v_customer RECORD;
  v_service_price NUMERIC := 0;
BEGIN
  -- Get customer address info
  SELECT address, city, state, zip_code
  INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  -- Get service price if service is provided
  IF p_service_id IS NOT NULL THEN
    SELECT base_price INTO v_service_price
    FROM services
    WHERE id = p_service_id;
    v_service_price := COALESCE(v_service_price, 0);
  END IF;

  -- Create the booking with valid payment_status enum value
  INSERT INTO bookings (
    organization_id,
    customer_id,
    service_id,
    scheduled_at,
    duration,
    status,
    payment_status,
    total_amount,
    address,
    city,
    state,
    zip_code
  ) VALUES (
    p_organization_id,
    p_customer_id,
    p_service_id,
    p_scheduled_at,
    p_duration,
    'confirmed',
    'pending',  -- Use valid enum value 'pending' instead of 'unpaid'
    v_service_price,
    v_customer.address,
    v_customer.city,
    v_customer.state,
    v_customer.zip_code
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;