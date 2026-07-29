CREATE OR REPLACE FUNCTION public.submit_client_booking_request(p_client_user_id uuid, p_customer_id uuid, p_organization_id uuid, p_requested_date timestamp with time zone, p_service_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id UUID;
  v_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.client_portal_users
    WHERE id = p_client_user_id
      AND customer_id = p_customer_id
      AND organization_id = p_organization_id
      AND is_active = true
  ) INTO v_is_valid;
  
  IF NOT v_is_valid THEN
    RAISE EXCEPTION 'Invalid client portal user or session';
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF NOT EXISTS(
      SELECT 1 FROM public.locations
      WHERE id = p_location_id
        AND customer_id = p_customer_id
    ) THEN
      RAISE EXCEPTION 'Invalid location for this customer';
    END IF;
  END IF;
  
  INSERT INTO public.client_booking_requests (
    client_user_id,
    customer_id,
    organization_id,
    requested_date,
    service_id,
    notes,
    status,
    location_id
  ) VALUES (
    p_client_user_id,
    p_customer_id,
    p_organization_id,
    p_requested_date,
    p_service_id,
    p_notes,
    'pending',
    p_location_id
  )
  RETURNING id INTO v_request_id;
  
  RETURN v_request_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text);