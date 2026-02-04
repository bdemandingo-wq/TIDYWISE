-- Create RPC to delete client portal notification
CREATE OR REPLACE FUNCTION public.delete_client_portal_notification(
  p_notification_id UUID,
  p_client_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.client_notifications
  WHERE id = p_notification_id
    AND client_user_id = p_client_user_id;
  
  RETURN FOUND;
END;
$$;