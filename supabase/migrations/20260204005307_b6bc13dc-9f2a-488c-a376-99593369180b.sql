-- Update RPC to allow deleting any request, not just pending
CREATE OR REPLACE FUNCTION public.delete_client_booking_request(
  p_request_id UUID,
  p_client_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.client_booking_requests
  WHERE id = p_request_id
    AND client_user_id = p_client_user_id;
  
  RETURN FOUND;
END;
$$;