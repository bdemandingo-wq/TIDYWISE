-- Fix create_booking_from_request autofill: copy last booking totals when no service chosen; ensure team assignments exist
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

  -- Last-booking template fields
  v_last_booking_id UUID;
  v_staff_id UUID;
  v_last_duration INTEGER;
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
  v_last_total_amount NUMERIC;
  v_last_service_id UUID;

  -- Resolved output fields
  v_service_id_to_use UUID;
  v_final_duration INTEGER;
  v_final_total_amount NUMERIC;

  -- Service lookup (only when explicitly chosen or needed as fallback)
  v_service_price NUMERIC;
  v_service_duration INTEGER;

  v_found_last_booking BOOLEAN := FALSE;
  v_team_rows_inserted INTEGER := 0;
BEGIN
  -- Pull the customer’s latest completed/confirmed booking as the template
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
    v_last_duration,
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
    v_last_total_amount,
    v_last_service_id
  FROM bookings b
  WHERE b.customer_id = p_customer_id
    AND b.organization_id = p_organization_id
    AND b.status IN ('completed', 'confirmed')
  ORDER BY b.scheduled_at DESC
  LIMIT 1;

  IF v_last_booking_id IS NOT NULL THEN
    v_found_last_booking := TRUE;
  ELSE
    -- Fallback to customer profile address if we don't have any template booking
    SELECT c.address, c.city, c.state, c.zip_code
    INTO v_address, v_city, v_state, v_zip_code
    FROM customers c
    WHERE c.id = p_customer_id;
  END IF;

  v_service_id_to_use := COALESCE(p_service_id, v_last_service_id);

  -- Duration rules:
  -- - If an explicit service was chosen: use that service's duration when available
  -- - Else: use last booking duration, falling back to p_duration
  IF p_service_id IS NOT NULL THEN
    SELECT s.price, s.duration
    INTO v_service_price, v_service_duration
    FROM services s
    WHERE s.id = p_service_id;

    v_final_duration := COALESCE(v_service_duration, p_duration, v_last_duration, 120);
  ELSE
    v_final_duration := COALESCE(v_last_duration, p_duration, 120);
  END IF;

  -- Price rules:
  -- - If an explicit service was chosen: use the service price (fallback to last total)
  -- - If no explicit service: prefer last booking total_amount (so we truly "copy last booking")
  --   and only fall back to service.price if last_total_amount is null.
  IF p_service_id IS NOT NULL THEN
    v_final_total_amount := COALESCE(v_service_price, v_last_total_amount, 0);
  ELSE
    v_final_total_amount := v_last_total_amount;

    IF v_final_total_amount IS NULL THEN
      IF v_service_id_to_use IS NOT NULL THEN
        SELECT s.price
        INTO v_service_price
        FROM services s
        WHERE s.id = v_service_id_to_use;

        v_final_total_amount := COALESCE(v_service_price, 0);
      ELSE
        v_final_total_amount := 0;
      END IF;
    END IF;
  END IF;

  -- Create booking
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
    v_service_id_to_use,
    v_staff_id,
    p_scheduled_at,
    v_final_duration,
    'confirmed',
    'pending',
    COALESCE(v_final_total_amount, 0),
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

  -- Team assignments:
  -- 1) Copy from last booking if they exist
  -- 2) If none exist but we have a staff_id, create a primary assignment so UI/team logic isn't blank
  IF v_found_last_booking THEN
    INSERT INTO booking_team_assignments (booking_id, staff_id, is_primary, pay_share, organization_id)
    SELECT v_booking_id, bta.staff_id, bta.is_primary, bta.pay_share, COALESCE(bta.organization_id, p_organization_id)
    FROM booking_team_assignments bta
    WHERE bta.booking_id = v_last_booking_id;

    GET DIAGNOSTICS v_team_rows_inserted = ROW_COUNT;
  END IF;

  IF COALESCE(v_team_rows_inserted, 0) = 0 AND v_staff_id IS NOT NULL THEN
    INSERT INTO booking_team_assignments (booking_id, staff_id, is_primary, pay_share, organization_id)
    VALUES (v_booking_id, v_staff_id, true, 1, p_organization_id);
  END IF;

  RETURN v_booking_id;
END;
$$;