CREATE OR REPLACE FUNCTION public.update_client_portal_location(
  p_client_user_id uuid,
  p_customer_id uuid,
  p_location_id uuid,
  p_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_apt_suite text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Portal account must be active and belong to this customer.
  IF NOT EXISTS (
    SELECT 1 FROM public.client_portal_users
    WHERE id = p_client_user_id
      AND customer_id = p_customer_id
      AND is_active = true
  ) THEN
    RETURN false;
  END IF;

  -- 2) The location must belong to that same customer.
  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_location_id AND customer_id = p_customer_id
  ) THEN
    RETURN false;
  END IF;

  -- 3) Address fields only. price_override is deliberately never written here.
  UPDATE public.locations
  SET
    name      = COALESCE(NULLIF(btrim(p_name), ''), name),
    address   = COALESCE(NULLIF(btrim(p_address), ''), address),
    apt_suite = COALESCE(p_apt_suite, apt_suite),
    city      = COALESCE(NULLIF(btrim(p_city), ''), city),
    state     = COALESCE(NULLIF(btrim(p_state), ''), state),
    zip_code  = COALESCE(NULLIF(btrim(p_zip_code), ''), zip_code),
    latitude  = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    updated_at = now()
  WHERE id = p_location_id
    AND customer_id = p_customer_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client_portal_location(uuid,uuid,uuid,text,text,text,text,text,text,double precision,double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_client_portal_location(uuid,uuid,uuid,text,text,text,text,text,text,double precision,double precision) FROM anon;
REVOKE ALL ON FUNCTION public.update_client_portal_location(uuid,uuid,uuid,text,text,text,text,text,text,double precision,double precision) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_portal_location(uuid,uuid,uuid,text,text,text,text,text,text,double precision,double precision) TO service_role;