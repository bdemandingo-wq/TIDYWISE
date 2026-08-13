delete from public.organization_email_settings
where organization_id = 'e4d60558-af69-45d2-97cf-cdea4c68a411';

delete from public.org_email_send_failures
where organization_id = 'e4d60558-af69-45d2-97cf-cdea4c68a411'
  and created_at > now() - interval '2 hours';

delete from public.email_send_log
where template_name = 'payroll-period-report'
  and metadata->>'organization_id' = 'e4d60558-af69-45d2-97cf-cdea4c68a411'
  and created_at > now() - interval '2 hours';