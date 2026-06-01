-- Generic rate-limit / abuse-throttle log.
--
-- Used by public-facing edge functions that take untrusted input and
-- have an abuse vector (eg "spam password resets to an email" or
-- "flood the admin's inbox with deletion requests"). Each call records
-- a row keyed by a stable identifier (email, IP, ip+action, etc.);
-- the helper in supabase/functions/_shared/rate-limit.ts queries the
-- recent count and blocks when over budget.
--
-- Aged-out rows are cleaned up by a daily cron — without it, the table
-- would grow unbounded and the lookup would slow down.

CREATE TABLE IF NOT EXISTS public.abuse_throttle (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,           -- "password_reset:email:foo@bar.com"
  action TEXT NOT NULL,           -- "password_reset" / "deletion_request"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abuse_throttle_bucket_created_idx
  ON public.abuse_throttle (bucket, created_at DESC);

CREATE INDEX IF NOT EXISTS abuse_throttle_created_idx
  ON public.abuse_throttle (created_at);

ALTER TABLE public.abuse_throttle ENABLE ROW LEVEL SECURITY;

-- No client SELECT/INSERT — only the service role (edge functions) writes.
-- No policy = no access for anon/authenticated, which is what we want.

GRANT ALL ON public.abuse_throttle TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.abuse_throttle_id_seq TO service_role;

-- Daily cleanup: keep last 7 days. Throttles are short-window (minutes
-- to hours) so a week is way more than enough for debugging.
DO $$ BEGIN
  PERFORM cron.unschedule('abuse-throttle-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'abuse-throttle-cleanup',
  '0 5 * * *',  -- daily at 05:00 UTC
  $$DELETE FROM public.abuse_throttle WHERE created_at < now() - interval '7 days'$$
);
