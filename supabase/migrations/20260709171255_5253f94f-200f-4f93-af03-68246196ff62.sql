-- Restore INSERT/UPDATE access for client portal session tracking.
-- Client portal users authenticate via a custom bcrypt-based flow (not Supabase Auth),
-- so auth.uid() is null on their requests. The 2026-07-02 hardening dropped the public
-- INSERT policy, which silently broke session tracking (RLS violations in logs since 2026-07-08).
-- Allow anon+authenticated to insert/update session rows; org admins can still read/delete
-- via the existing admin policies. No sensitive data lives in these rows.

DROP POLICY IF EXISTS "Anyone can insert client portal sessions" ON public.client_portal_sessions;
CREATE POLICY "Anyone can insert client portal sessions"
  ON public.client_portal_sessions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    client_user_id IS NOT NULL
    AND organization_id IS NOT NULL
    AND customer_email IS NOT NULL
  );

DROP POLICY IF EXISTS "Anyone can update own client portal session" ON public.client_portal_sessions;
CREATE POLICY "Anyone can update own client portal session"
  ON public.client_portal_sessions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT INSERT, UPDATE ON public.client_portal_sessions TO anon, authenticated;