-- Create trigger to automatically create admin notifications when new booking requests come in
CREATE OR REPLACE FUNCTION public.notify_admin_new_booking_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a notification for admins
  INSERT INTO admin_booking_request_notifications (
    booking_request_id,
    organization_id,
    is_read
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    false
  );
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_new_booking_request_notify ON client_booking_requests;
CREATE TRIGGER on_new_booking_request_notify
  AFTER INSERT ON client_booking_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_new_booking_request();