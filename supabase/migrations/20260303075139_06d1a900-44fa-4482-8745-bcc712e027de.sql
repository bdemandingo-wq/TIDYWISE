
CREATE OR REPLACE FUNCTION public.get_client_portal_locations(p_customer_id uuid)
 RETURNS TABLE(id uuid, name text, address text, apt_suite text, city text, state text, zip_code text, is_primary boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- Saved locations from the locations table
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

  UNION ALL

  -- Customer profile address (if it exists and isn't already in locations)
  SELECT
    c.id AS id,
    'Primary Address'::text AS name,
    c.address,
    NULL::text AS apt_suite,
    c.city,
    c.state,
    c.zip_code,
    true AS is_primary
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.address IS NOT NULL
    AND c.address != ''
    AND NOT EXISTS (
      SELECT 1 FROM public.locations loc
      WHERE loc.customer_id = p_customer_id
        AND loc.address = c.address
    )

  ORDER BY is_primary DESC;
END;
$function$;
