-- Revokes PUBLIC/anon/authenticated EXECUTE on the 10 client-portal
-- SECURITY DEFINER functions that took an id/email straight from the
-- caller with no ownership check. The client portal has no Supabase Auth
-- session, so auth.uid() is always NULL for these calls — an in-function
-- check can't establish identity; only the new client-portal-api edge
-- function (which validates the signed portal session token before
-- calling these with the service-role client) can.
--
-- DO NOT APPLY until client-portal-api is deployed and confirmed working
-- end-to-end for all 10 operations across a live portal session — this
-- takes away every existing call path for all 10 functions in one shot.
-- If the new edge function has any gap, running this immediately breaks
-- the client portal for every customer of every org using it.
--
-- create_client_portal_referral's signature (uuid, text, text) is
-- inferred from its call site + this family's consistent uuid/text
-- typing convention, not confirmed via pg_get_functiondef — if wrong,
-- this statement fails loudly (function does not exist) rather than
-- silently doing nothing, so it's safe to include as-is.

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

-- Inferred signature — see header note.
REVOKE ALL ON FUNCTION public.create_client_portal_referral(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_portal_referral(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_client_portal_last_login(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_portal_last_login(uuid) TO service_role;
