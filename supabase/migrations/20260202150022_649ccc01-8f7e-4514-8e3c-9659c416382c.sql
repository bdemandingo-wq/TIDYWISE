-- Create RPC to fetch client booking requests (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_client_portal_requests(p_client_user_id UUID)
RETURNS TABLE (
  id UUID,
  requested_date TIMESTAMPTZ,
  status TEXT,
  notes TEXT,
  admin_response_note TEXT,
  created_at TIMESTAMPTZ,
  service_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.requested_date,
    r.status,
    r.notes,
    r.admin_response_note,
    r.created_at,
    s.name AS service_name
  FROM public.client_booking_requests r
  LEFT JOIN public.services s ON s.id = r.service_id
  WHERE r.client_user_id = p_client_user_id
  ORDER BY r.created_at DESC
  LIMIT 20;
END;
$$;

-- Create RPC to fetch client notifications (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_client_portal_notifications(p_client_user_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  message TEXT,
  type TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id,
    n.title,
    n.message,
    n.type,
    n.is_read,
    n.created_at
  FROM public.client_notifications n
  WHERE n.client_user_id = p_client_user_id
  ORDER BY n.created_at DESC
  LIMIT 20;
END;
$$;

-- Create RPC to mark notification as read (bypasses RLS)
CREATE OR REPLACE FUNCTION public.mark_client_notification_read(p_notification_id UUID, p_client_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_notifications
  SET is_read = true
  WHERE id = p_notification_id
    AND client_user_id = p_client_user_id;
  
  RETURN FOUND;
END;
$$;

-- Create RPC to update client profile (bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_client_portal_profile(
  p_client_user_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Get customer_id for this portal user
  SELECT customer_id INTO v_customer_id
  FROM public.client_portal_users
  WHERE id = p_client_user_id AND is_active = true;
  
  IF v_customer_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Update the customer record
  UPDATE public.customers
  SET 
    first_name = p_first_name,
    last_name = p_last_name,
    phone = p_phone,
    updated_at = NOW()
  WHERE id = v_customer_id;
  
  RETURN FOUND;
END;
$$;

-- Create RPC to fetch customer locations/addresses (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_client_portal_locations(p_customer_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  apt_suite TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  is_primary BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.address,
    l.apt_suite,
    l.city,
    l.state,
    l.zip_code,
    l.is_primary
  FROM public.locations l
  WHERE l.customer_id = p_customer_id
  ORDER BY l.is_primary DESC, l.created_at DESC;
END;
$$;

-- Create RPC to add a new location for client (bypasses RLS)
CREATE OR REPLACE FUNCTION public.add_client_portal_location(
  p_client_user_id UUID,
  p_name TEXT,
  p_address TEXT,
  p_apt_suite TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_zip_code TEXT DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_organization_id UUID;
  v_location_id UUID;
BEGIN
  -- Get customer_id and org_id for this portal user
  SELECT cpu.customer_id, cpu.organization_id 
  INTO v_customer_id, v_organization_id
  FROM public.client_portal_users cpu
  WHERE cpu.id = p_client_user_id AND cpu.is_active = true;
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid client portal user';
  END IF;
  
  -- If setting as primary, unset other primary locations
  IF p_is_primary THEN
    UPDATE public.locations
    SET is_primary = false
    WHERE customer_id = v_customer_id;
  END IF;
  
  -- Insert the new location
  INSERT INTO public.locations (
    customer_id,
    organization_id,
    name,
    address,
    apt_suite,
    city,
    state,
    zip_code,
    is_primary
  ) VALUES (
    v_customer_id,
    v_organization_id,
    p_name,
    p_address,
    p_apt_suite,
    p_city,
    p_state,
    p_zip_code,
    p_is_primary
  )
  RETURNING id INTO v_location_id;
  
  RETURN v_location_id;
END;
$$;

-- Create RPC to delete a location for client (bypasses RLS)
CREATE OR REPLACE FUNCTION public.delete_client_portal_location(
  p_client_user_id UUID,
  p_location_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
BEGIN
  -- Get customer_id for this portal user
  SELECT customer_id INTO v_customer_id
  FROM public.client_portal_users
  WHERE id = p_client_user_id AND is_active = true;
  
  IF v_customer_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Delete the location only if it belongs to this customer
  DELETE FROM public.locations
  WHERE id = p_location_id AND customer_id = v_customer_id;
  
  RETURN FOUND;
END;
$$;

-- Create RPC to get loyalty tier info (all tiers) for display
CREATE OR REPLACE FUNCTION public.get_loyalty_tier_info(p_organization_id UUID)
RETURNS TABLE (
  tier_name TEXT,
  tier_order INT,
  min_spending NUMERIC,
  max_spending NUMERIC,
  benefits JSONB,
  color TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return custom tiers if they exist, otherwise return default tiers
  IF EXISTS (SELECT 1 FROM public.client_tier_settings WHERE organization_id = p_organization_id) THEN
    RETURN QUERY
    SELECT 
      cts.tier_name,
      cts.tier_order,
      cts.min_spending,
      cts.max_spending,
      cts.benefits,
      cts.color
    FROM public.client_tier_settings cts
    WHERE cts.organization_id = p_organization_id
    ORDER BY cts.tier_order;
  ELSE
    -- Return default tiers
    RETURN QUERY
    SELECT 'Bronze'::TEXT, 1, 0::NUMERIC, 499::NUMERIC, '["Welcome reward"]'::JSONB, '#CD7F32'::TEXT
    UNION ALL
    SELECT 'Silver'::TEXT, 2, 500::NUMERIC, 1999::NUMERIC, '["5% discount", "Priority booking"]'::JSONB, '#C0C0C0'::TEXT
    UNION ALL
    SELECT 'Gold'::TEXT, 3, 2000::NUMERIC, 4999::NUMERIC, '["10% discount", "Priority booking", "Free add-on"]'::JSONB, '#FFD700'::TEXT
    UNION ALL
    SELECT 'Platinum'::TEXT, 4, 5000::NUMERIC, NULL::NUMERIC, '["15% discount", "Priority booking", "Free add-on", "VIP support"]'::JSONB, '#E5E4E2'::TEXT
    ORDER BY 2;
  END IF;
END;
$$;