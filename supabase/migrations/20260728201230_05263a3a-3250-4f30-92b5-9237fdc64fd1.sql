DROP POLICY IF EXISTS "Anon can update own abandoned row by session token" ON public.abandoned_bookings;

CREATE POLICY "Anon can update own abandoned row by session token"
ON public.abandoned_bookings
FOR UPDATE
TO anon, authenticated
USING (
  session_token IS NOT NULL
  AND session_token = nullif(current_setting('request.headers', true)::json ->> 'x-abandoned-session', '')
)
WITH CHECK (
  session_token IS NOT NULL
  AND session_token = nullif(current_setting('request.headers', true)::json ->> 'x-abandoned-session', '')
);