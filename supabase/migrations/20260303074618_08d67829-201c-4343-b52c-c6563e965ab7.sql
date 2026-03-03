
CREATE OR REPLACE FUNCTION public.get_client_portal_user_data(p_email text)
 RETURNS TABLE(user_id uuid, username text, customer_id uuid, organization_id uuid, is_active boolean, must_change_password boolean, first_name text, last_name text, email text, phone text, loyalty_points integer, loyalty_lifetime_points integer, loyalty_tier text, property_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    cpu.id AS user_id, cpu.username, cpu.customer_id, cpu.organization_id,
    cpu.is_active, cpu.must_change_password,
    c.first_name, c.last_name, c.email, c.phone,
    cl.points AS loyalty_points, cl.lifetime_points AS loyalty_lifetime_points,
    cl.tier AS loyalty_tier,
    NULL::text AS property_type
  FROM public.client_portal_users cpu
  JOIN public.customers c ON c.id = cpu.customer_id
  LEFT JOIN public.customer_loyalty cl ON cl.customer_id = cpu.customer_id
  WHERE LOWER(c.email) = LOWER(p_email);
END;
$function$;
