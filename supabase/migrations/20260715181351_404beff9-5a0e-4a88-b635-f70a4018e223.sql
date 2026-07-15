REVOKE ALL ON FUNCTION public.get_client_portal_bookings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portal_bookings(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_user_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portal_user_data(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_requests(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portal_requests(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portal_notifications(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_locations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_portal_locations(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_client_tax_report(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_tax_report(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.update_client_portal_profile(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_portal_profile(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.add_client_portal_location(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_client_portal_location(uuid, text, text, text, text, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.update_client_portal_last_login(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_portal_last_login(uuid) TO service_role;