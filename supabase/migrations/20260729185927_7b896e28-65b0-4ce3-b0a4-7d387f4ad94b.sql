GRANT EXECUTE ON FUNCTION public.change_client_portal_password(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_cancel_booking(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_portal_location(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_portal_notification(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_client_notification_read(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_booking_request(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text, uuid) TO anon, authenticated, service_role;