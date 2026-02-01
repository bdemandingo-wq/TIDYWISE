-- Update client portal user data function to lookup by email instead of username
DROP FUNCTION IF EXISTS public.get_client_portal_user_data(TEXT);

CREATE OR REPLACE FUNCTION public.get_client_portal_user_data(p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  customer_id UUID,
  organization_id UUID,
  is_active BOOLEAN,
  must_change_password BOOLEAN,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  loyalty_points INTEGER,
  loyalty_lifetime_points INTEGER,
  loyalty_tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cpu.id AS user_id,
    cpu.username,
    cpu.customer_id,
    cpu.organization_id,
    cpu.is_active,
    cpu.must_change_password,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    cl.points AS loyalty_points,
    cl.lifetime_points AS loyalty_lifetime_points,
    cl.tier AS loyalty_tier
  FROM public.client_portal_users cpu
  JOIN public.customers c ON c.id = cpu.customer_id
  LEFT JOIN public.customer_loyalty cl ON cl.customer_id = cpu.customer_id
  WHERE LOWER(c.email) = LOWER(p_email);
END;
$$;

-- Update validate login function to use email
DROP FUNCTION IF EXISTS public.validate_client_portal_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.validate_client_portal_login(p_email TEXT, p_password TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_stored_hash TEXT;
  v_is_active BOOLEAN;
BEGIN
  -- Look up the user by customer email
  SELECT cpu.id, cpu.password_hash, cpu.is_active
  INTO v_user_id, v_stored_hash, v_is_active
  FROM public.client_portal_users cpu
  JOIN public.customers c ON c.id = cpu.customer_id
  WHERE LOWER(c.email) = LOWER(p_email);
  
  -- User not found
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'user_not_found');
  END IF;
  
  -- Check if active
  IF NOT v_is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;
  
  -- Verify password using crypt with explicit schema
  IF v_stored_hash = extensions.crypt(p_password, v_stored_hash) THEN
    RETURN jsonb_build_object('valid', true, 'user_id', v_user_id);
  ELSE
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_password');
  END IF;
END;
$$;

-- Create function to change client portal password
CREATE OR REPLACE FUNCTION public.change_client_portal_password(
  p_user_id UUID,
  p_current_password TEXT,
  p_new_password TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash TEXT;
BEGIN
  -- Get current password hash
  SELECT password_hash INTO v_stored_hash
  FROM public.client_portal_users
  WHERE id = p_user_id;
  
  IF v_stored_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Verify current password
  IF v_stored_hash != extensions.crypt(p_current_password, v_stored_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Current password is incorrect');
  END IF;
  
  -- Update to new password
  UPDATE public.client_portal_users
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_change_password = false,
      updated_at = NOW()
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_client_portal_user_data(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_client_portal_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_client_portal_password(UUID, TEXT, TEXT) TO anon, authenticated;