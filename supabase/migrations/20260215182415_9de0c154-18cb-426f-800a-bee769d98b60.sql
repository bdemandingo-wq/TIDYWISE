-- Drop and recreate get_client_portal_user_data with new return type
DROP FUNCTION IF EXISTS public.get_client_portal_user_data(text);

CREATE OR REPLACE FUNCTION public.get_client_portal_user_data(p_email TEXT)
RETURNS TABLE(
  user_id UUID, username TEXT, customer_id UUID, organization_id UUID,
  is_active BOOLEAN, must_change_password BOOLEAN,
  first_name TEXT, last_name TEXT, email TEXT, phone TEXT,
  loyalty_points INTEGER, loyalty_lifetime_points INTEGER, loyalty_tier TEXT,
  property_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cpu.id AS user_id, cpu.username, cpu.customer_id, cpu.organization_id,
    cpu.is_active, cpu.must_change_password,
    c.first_name, c.last_name, c.email, c.phone,
    cl.points AS loyalty_points, cl.lifetime_points AS loyalty_lifetime_points,
    cl.tier AS loyalty_tier,
    c.property_type
  FROM public.client_portal_users cpu
  JOIN public.customers c ON c.id = cpu.customer_id
  LEFT JOIN public.customer_loyalty cl ON cl.customer_id = cpu.customer_id
  WHERE LOWER(c.email) = LOWER(p_email);
END;
$$;