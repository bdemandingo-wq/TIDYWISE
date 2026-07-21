
CREATE TABLE IF NOT EXISTS public.abuse_throttle (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abuse_throttle_bucket_created_idx
  ON public.abuse_throttle (bucket, created_at DESC);

CREATE INDEX IF NOT EXISTS abuse_throttle_created_idx
  ON public.abuse_throttle (created_at);

ALTER TABLE public.abuse_throttle ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.abuse_throttle TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.abuse_throttle_id_seq TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('abuse-throttle-cleanup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'abuse-throttle-cleanup',
  '0 5 * * *',
  $$DELETE FROM public.abuse_throttle WHERE created_at < now() - interval '7 days'$$
);
