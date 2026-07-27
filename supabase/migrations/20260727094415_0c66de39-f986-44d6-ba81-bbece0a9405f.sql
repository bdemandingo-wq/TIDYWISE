ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DROP FUNCTION IF EXISTS public.add_client_portal_location(
  uuid, text, text, text, text, text, text, boolean
);

CREATE OR REPLACE FUNCTION public.add_client_portal_location(
  p_client_user_id UUID,
  p_name TEXT,
  p_address TEXT,
  p_apt_suite TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_zip_code TEXT DEFAULT NULL,
  p_is_primary BOOLEAN DEFAULT FALSE,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id UUID;
  v_organization_id UUID;
  v_location_id UUID;
BEGIN
  SELECT cpu.customer_id, cpu.organization_id
  INTO v_customer_id, v_organization_id
  FROM public.client_portal_users cpu
  WHERE cpu.id = p_client_user_id AND cpu.is_active = true;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid client portal user';
  END IF;

  IF p_is_primary THEN
    UPDATE public.locations
    SET is_primary = false
    WHERE customer_id = v_customer_id;
  END IF;

  INSERT INTO public.locations (
    customer_id, organization_id, name, address, apt_suite,
    city, state, zip_code, latitude, longitude, is_primary
  ) VALUES (
    v_customer_id, v_organization_id, p_name, p_address, p_apt_suite,
    p_city, p_state, p_zip_code, p_latitude, p_longitude, p_is_primary
  )
  RETURNING id INTO v_location_id;

  RETURN v_location_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_client_portal_location(
  uuid, text, text, text, text, text, text, boolean, double precision, double precision
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_client_portal_location(
  uuid, text, text, text, text, text, text, boolean, double precision, double precision
) TO anon, authenticated, service_role;