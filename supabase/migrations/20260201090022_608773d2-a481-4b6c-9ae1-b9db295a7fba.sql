-- Drop existing functions if they exist to recreate them
DROP FUNCTION IF EXISTS public.get_client_portal_user_data(TEXT);
DROP FUNCTION IF EXISTS public.update_client_portal_last_login(UUID);

-- Create function to get client portal user data (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_client_portal_user_data(p_username TEXT)
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
  WHERE cpu.username = LOWER(p_username);
END;
$$;

-- Create function to update last login (bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_client_portal_last_login(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_portal_users
  SET last_login_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_client_portal_user_data(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_portal_last_login(UUID) TO anon, authenticated;