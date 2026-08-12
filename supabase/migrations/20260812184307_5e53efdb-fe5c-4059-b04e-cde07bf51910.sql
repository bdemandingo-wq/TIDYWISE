-- Speed-to-lead dispatch: fire notify-new-lead the moment a lead arrives.
-- Task S1b of docs/superpowers/plans/2026-08-12-speed-to-lead.md
--
-- Vault, not app.settings.*. This copies the convention used by 12+ cron
-- migrations (e.g. 20260506204202_automation_phase_2_cron.sql:22-29) and pairs
-- with requireCronSecret on the receiving function. A SECURITY DEFINER function
-- reading vault.decrypted_secrets was verified working on this project
-- 2026-08-12 via a disposable probe — every prior use is inside cron.schedule,
-- which runs as the job owner, so trigger context could not be assumed.
--
-- Do NOT copy the auth pattern from 20251224072250_*.sql:64, which sends
-- 'Bearer ' || current_setting('request.jwt.claims')::json->>'role' — that is
-- the role NAME, not a JWT. See
-- docs/superpowers/plans/2026-08-12-pgnet-trigger-auth-defect.md

create or replace function public.notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'supabase_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    -- Loud, and does not fire an unauthenticated request.
    raise warning 'notify_new_lead: vault secrets missing, lead % not dispatched', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/notify-new-lead',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := jsonb_build_object('lead_id', new.id)
  );

  return new;

exception when others then
  -- A dispatch failure must never roll back the INSERT. An uncaught exception
  -- in an AFTER INSERT trigger aborts the whole statement, which would mean a
  -- Facebook lead we were paid for is not merely un-texted but never stored.
  -- A captured-but-unnotified lead is recoverable; a lost one is not.
  raise warning 'notify_new_lead failed for lead %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Rule 2: a SECURITY DEFINER function should not be executable by clients. This
-- one is only ever invoked by the trigger below.
revoke all on function public.notify_new_lead() from public, anon, authenticated;

-- The WHEN clause IS the backfill guard, enforced by Postgres rather than by an
-- application branch that could be refactored away. A row with backfilled_at set
-- never invokes the function at all — which is why the historical-import marker
-- had to be a column and not a notes convention.
drop trigger if exists trg_notify_new_lead on public.leads;
create trigger trg_notify_new_lead
  after insert on public.leads
  for each row
  when (new.backfilled_at is null)
  execute function public.notify_new_lead();