DROP POLICY IF EXISTS "Anyone can insert client portal sessions" ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Anyone can update own client portal session" ON public.client_portal_sessions;

REVOKE ALL ON public.client_portal_sessions FROM anon;
REVOKE INSERT ON public.client_portal_sessions FROM authenticated;

GRANT SELECT, UPDATE, DELETE ON public.client_portal_sessions TO authenticated;
GRANT ALL ON public.client_portal_sessions TO service_role;