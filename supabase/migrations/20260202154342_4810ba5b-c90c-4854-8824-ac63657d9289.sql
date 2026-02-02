-- Fix the status check constraint to allow 'rejected' (what the code uses)
ALTER TABLE public.client_booking_requests DROP CONSTRAINT IF EXISTS client_booking_requests_status_check;
ALTER TABLE public.client_booking_requests ADD CONSTRAINT client_booking_requests_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

-- Update any existing 'declined' status to 'rejected' (just in case)
UPDATE public.client_booking_requests SET status = 'rejected' WHERE status = 'declined';

-- Function to create booking when request is approved
CREATE OR REPLACE FUNCTION public.create_booking_from_request(
  p_request_id UUID,
  p_organization_id UUID,
  p_customer_id UUID,
  p_service_id UUID,
  p_scheduled_at TIMESTAMPTZ,
  p_duration INTEGER DEFAULT 120
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_customer RECORD;
BEGIN
  -- Get customer address info
  SELECT address, city, state, zip_code
  INTO v_customer
  FROM customers
  WHERE id = p_customer_id;

  -- Create the booking
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
    'unpaid',
    0,
    v_customer.address,
    v_customer.city,
    v_customer.state,
    v_customer.zip_code
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

-- Function to reset client portal user password (for admin)
CREATE OR REPLACE FUNCTION public.reset_client_portal_password(
  p_user_id UUID,
  p_new_password TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE client_portal_users
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_change_password = true,
      updated_at = now()
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$;

-- Function to get client booking history for tax report
CREATE OR REPLACE FUNCTION public.get_client_tax_report(
  p_client_user_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::INTEGER
) RETURNS TABLE (
  booking_date DATE,
  service_name TEXT,
  address TEXT,
  subtotal NUMERIC,
  tax_amount NUMERIC,
  total_amount NUMERIC,
  payment_status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Get customer_id from client portal user
  SELECT cpu.customer_id INTO v_customer_id
  FROM client_portal_users cpu
  WHERE cpu.id = p_client_user_id;

  IF v_customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    DATE(b.scheduled_at) as booking_date,
    COALESCE(s.name, 'Service') as service_name,
    COALESCE(b.address, '') as address,
    COALESCE(b.subtotal, b.total_amount) as subtotal,
    COALESCE(b.tax_amount, 0) as tax_amount,
    b.total_amount,
    b.payment_status::TEXT
  FROM bookings b
  LEFT JOIN services s ON s.id = b.service_id
  WHERE b.customer_id = v_customer_id
    AND EXTRACT(YEAR FROM b.scheduled_at) = p_year
    AND b.status IN ('completed', 'confirmed')
  ORDER BY b.scheduled_at DESC;
END;
$$;