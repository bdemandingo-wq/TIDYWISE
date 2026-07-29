REVOKE EXECUTE ON FUNCTION public.change_client_portal_password(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_cancel_booking(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_client_portal_location(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_client_portal_notification(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_client_notification_read(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_client_booking_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.change_client_portal_password(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.client_cancel_booking(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_portal_location(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_portal_notification(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_client_notification_read(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_booking_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text, uuid) TO service_role;