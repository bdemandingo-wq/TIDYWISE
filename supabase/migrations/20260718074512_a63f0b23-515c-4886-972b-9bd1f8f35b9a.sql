REVOKE ALL ON FUNCTION public.reset_client_portal_password(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_client_portal_password(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.stripe_duplicate_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_duplicate_accounts() TO service_role;