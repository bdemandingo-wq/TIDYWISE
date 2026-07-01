
DO $$
DECLARE
  v_url text := 'https://slwfkaqczvwvvvavkgpr.supabase.co';
  v_cron text := 'CV6Q4SrgEvPlvdXmRP2EMXVLaB0zJL4o6rqUnR79F7QH4tiQ3TM7qWdM69WFvFV6';
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'supabase_url';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(v_url, 'supabase_url');
  ELSE
    PERFORM vault.update_secret(existing_id, v_url, 'supabase_url');
  END IF;

  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'cron_secret';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(v_cron, 'cron_secret');
  ELSE
    PERFORM vault.update_secret(existing_id, v_cron, 'cron_secret');
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'blog-publisher-%' OR jobname IN ('blog-publisher-monday','blog-publisher-thursday') LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

SELECT cron.schedule('blog-publisher-mon', '0 10 * * 1',
  $$SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_url') || '/functions/v1/generate-daily-blogs',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
    body := jsonb_build_object('auto_publish', true)
  );$$);

SELECT cron.schedule('blog-publisher-tue', '0 10 * * 2',
  $$SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_url') || '/functions/v1/generate-daily-blogs',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
    body := jsonb_build_object('auto_publish', true)
  );$$);

SELECT cron.schedule('blog-publisher-thu', '0 10 * * 4',
  $$SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_url') || '/functions/v1/generate-daily-blogs',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
    body := jsonb_build_object('auto_publish', true)
  );$$);

SELECT cron.schedule('blog-publisher-sat', '0 10 * * 6',
  $$SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='supabase_url') || '/functions/v1/generate-daily-blogs',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
    body := jsonb_build_object('auto_publish', true)
  );$$);
