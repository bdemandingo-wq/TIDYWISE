REVOKE EXECUTE ON FUNCTION public.reset_client_portal_password(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_client_portal_password(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_client_portal_password(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_client_portal_password(uuid, text) TO service_role;