
-- Drop the existing policy and recreate with proper check
DROP POLICY IF EXISTS "Platform admin can view all sessions" ON public.user_sessions;

-- Create policy using auth.jwt() to get the email from the current session
CREATE POLICY "Platform admin can view all sessions"
ON public.user_sessions
FOR SELECT
USING (
  (auth.jwt() ->> 'email') = 'support@tidywisecleaning.com'
);
