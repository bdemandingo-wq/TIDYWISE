SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/run-inactive-campaign',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'),
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
  ),
  body := jsonb_build_object(
    'organizationId', 'e95b92d0-7099-408e-a773-e4407b34f8b4',
    'campaignId', '3f7ae88a-97ea-4690-8e3b-f22acf02008a',
    'targetAudience', 'active_clients',
    'daysInactive', 30,
    'message', 'Hi {first_name}! This is {company_name}. {booking_link} Reply STOP to opt out.',
    'testMode', false,
    'scheduledAt', (now() + interval '7 days')::text
  ),
  timeout_milliseconds := 30000
);