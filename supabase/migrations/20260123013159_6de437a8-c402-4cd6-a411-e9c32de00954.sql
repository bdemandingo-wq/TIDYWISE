-- Fix platform admin visibility for user_sessions by avoiding auth.users reference
-- (auth.users is not readable under normal RLS execution context, causing the policy to evaluate false)

DROP POLICY IF EXISTS "Platform admin can view all sessions" ON public.user_sessions;

CREATE POLICY "Platform admin can view all sessions"
ON public.user_sessions
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (auth.jwt() ->> 'email') = 'support@tidywisecleaning.com'
);
