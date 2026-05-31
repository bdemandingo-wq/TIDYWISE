-- Auto-publish blog posts twice a week.
--
-- Schedule: Monday 10:00 UTC + Thursday 10:00 UTC.
-- Pulls the next queued keyword from blog_keyword_queue, drafts via
-- gpt-5, runs a humanizer pass, scores quality, then auto-publishes
-- if quality >= 60 AND no near-duplicate title exists. Posts below
-- threshold stay as drafts for manual review.
--
-- Idempotent: unschedules any prior version of the job first.
--
-- Requires vault secrets:
--   - supabase_url      (the project URL)
--   - cron_secret       (matches CRON_SECRET on the edge function)

DO $$ BEGIN
  PERFORM cron.unschedule('blog-publisher-monday');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('blog-publisher-thursday');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'blog-publisher-monday',
  '0 10 * * 1',  -- Monday 10:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/generate-daily-blogs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('auto_publish', true)
  );
  $$
);

SELECT cron.schedule(
  'blog-publisher-thursday',
  '0 10 * * 4',  -- Thursday 10:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/generate-daily-blogs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('auto_publish', true)
  );
  $$
);
