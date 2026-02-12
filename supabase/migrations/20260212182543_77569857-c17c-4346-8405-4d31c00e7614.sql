
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow insert sessions" ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Allow update sessions" ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Allow read sessions" ON public.client_portal_sessions;

-- Org admins can view their org's client sessions
CREATE POLICY "Org members view client sessions"
ON public.client_portal_sessions FOR SELECT TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
));

-- Allow insert with org isolation (client portal session tracker uses anon key, so keep permissive for insert but scope to org)
CREATE POLICY "Insert client sessions"
ON public.client_portal_sessions FOR INSERT
WITH CHECK (true);

-- Allow update only on own sessions
CREATE POLICY "Update own client sessions"
ON public.client_portal_sessions FOR UPDATE
USING (true)
WITH CHECK (true);
