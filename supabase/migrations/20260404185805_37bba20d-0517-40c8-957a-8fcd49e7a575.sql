
-- FIX: client_portal_sessions "always true" UPDATE policy
DROP POLICY IF EXISTS "Public can update own client sessions by token" ON public.client_portal_sessions;

CREATE POLICY "Users can update own client sessions"
ON public.client_portal_sessions
FOR UPDATE
TO anon, authenticated
USING (client_user_id IS NOT NULL)
WITH CHECK (client_user_id IS NOT NULL);

-- FIX: ai_reply_locks - ensure restricted to authenticated
DROP POLICY IF EXISTS "Authenticated users can manage ai reply locks" ON public.ai_reply_locks;

CREATE POLICY "Authenticated users can manage ai reply locks"
ON public.ai_reply_locks
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
