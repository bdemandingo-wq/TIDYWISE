-- Phase 2 verification — campaign queue worker + self-arming dispatcher
-- 2026-07-28. Run AFTER prompts 2.1–2.3 are deployed.
-- Blocks A and B are read-only. Block C creates a real test run that sends
-- ONE real SMS to a number you control. Read the note before running it.

-- ═══════════════════════════════════════════════════════════════
-- A. Objects exist (read-only) — run after 2.3
-- ═══════════════════════════════════════════════════════════════

-- Dispatcher pair present, SECURITY DEFINER, locked down?
select
  p.proname,
  p.prosecdef                                as security_definer,
  pg_get_function_identity_arguments(p.oid)  as args,
  array(
    select grantee || '=' || privilege_type
    from information_schema.routine_privileges rp
    where rp.specific_name = p.proname || '_' || p.oid
  )                                          as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('campaign_queue_wake','campaign_queue_dispatch');
-- Expect: 2 rows, security_definer = true for both, no PUBLIC grants.

-- Wake trigger attached to campaign_runs — and NOT behind a to_regclass guard
-- that could have skipped. If this returns zero rows, 2.3 did not take.
select tgname, tgrelid::regclass as on_table, tgenabled, tgtype
from pg_trigger
where tgname = 'campaign_queue_wake_trigger'
   or tgrelid = 'public.campaign_runs'::regclass;
-- Expect: 1 row on public.campaign_runs, tgenabled = 'O'.

-- No cron job should exist yet — nothing has armed it.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'process-campaign-queue';
-- Expect: 0 rows. A row here now means it armed without a run, which is a bug.

-- Confirm the advisory lock key differs from the email pair's.
-- (Visual check of the function body — they must not share 7700000000000001.)
select prosrc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'campaign_queue_dispatch';


-- ═══════════════════════════════════════════════════════════════
-- B. Arm / disarm cycle — no messages sent (safe)
-- ═══════════════════════════════════════════════════════════════
-- Creates a run with ZERO queued messages, so the worker has nothing to send.
-- Proves the trigger arms the cron and the dispatcher disarms itself.

-- B1. Pick any org id you own.
--     select id, name from public.organizations limit 5;

-- B2. Create an empty run. Replace <ORG_ID> and <CAMPAIGN_ID>.
insert into public.campaign_runs
  (campaign_id, organization_id, status, throttle_seconds, expires_at, total_recipients)
values
  ('<CAMPAIGN_ID>', '<ORG_ID>', 'pending', 30, now() + interval '24 hours', 0)
returning id, status, expires_at;

-- B3. Immediately after: the cron job should now exist.
select jobname, schedule, active from cron.job where jobname = 'process-campaign-queue';
-- Expect: 1 row, schedule '15 seconds', active = true.

-- B4. Wait ~30s, then check the run completed (no messages to send) and the
--     job disarmed itself.
select id, status, sent_count, completed_at from public.campaign_runs
order by created_at desc limit 1;
-- Expect: status = 'completed'.

select count(*) as job_still_armed from cron.job where jobname = 'process-campaign-queue';
-- Expect: 0. If it is still 1, the disarm predicate is wrong — do not proceed.

-- B5. Pause/cancel authorization check. As a NON-admin authenticated user,
--     this must fail; as an org admin it must succeed.
-- select public.set_campaign_run_status('<RUN_ID>', 'paused');

-- B6. Direct table write must be refused for `authenticated`:
-- update public.campaign_runs set status = 'running' where id = '<RUN_ID>';
-- Expect: permission denied. If this succeeds, RLS/grants regressed.


-- ═══════════════════════════════════════════════════════════════
-- C. Single real send  ⚠️  SENDS ONE ACTUAL SMS
-- ═══════════════════════════════════════════════════════════════
-- Use a customer row whose phone is YOUR OWN number. Do not run this
-- against a real customer. One message, one recipient.

-- C1. Create the run, then enqueue exactly one message by hand.
--     Payload shape must match what the worker expects:
--       { run_id, campaign_id, organization_id, customer_id,
--         phone, first_name, last_name, message_template }
--
-- select pgmq.send('campaign_sms', jsonb_build_object(
--   'run_id',           '<RUN_ID>',
--   'campaign_id',      '<CAMPAIGN_ID>',
--   'organization_id',  '<ORG_ID>',
--   'customer_id',      '<YOUR_TEST_CUSTOMER_ID>',
--   'phone',            '+1<YOUR_NUMBER>',
--   'first_name',       'Test',
--   'last_name',        'Run',
--   'message_template', 'Test from the campaign queue. Reply STOP to opt out.'
-- ));

-- C2. Then update total_recipients to 1 and let it run.
-- update public.campaign_runs set total_recipients = 1 where id = '<RUN_ID>';

-- C3. Outcome checks.
select id, status, total_recipients, sent_count, failed_count,
       skipped_opted_out_count, started_at, completed_at, next_send_at
from public.campaign_runs where id = '<RUN_ID>';
-- Expect: status 'completed', sent_count 1, failed_count 0.

-- Logged to campaign_sms_sends?
select id, campaign_id, customer_id, phone_number, status, campaign_type, sent_at
from public.campaign_sms_sends
order by sent_at desc limit 3;

-- THE KEY ONE — did it land in sms_messages at send time?
-- This is the fix for "messages didn't appear, then showed up later".
select id, conversation_id, direction, openphone_message_id, created_at
from public.sms_messages
order by created_at desc limit 3;
-- Expect: an outbound row present within seconds of the send, NOT only after
-- OpenPhone's webhook echoes back.

-- And no duplicate once the webhook does arrive — re-run this a minute later
-- and confirm the count has not doubled.
select openphone_message_id, count(*) as rows
from public.sms_messages
where created_at > now() - interval '10 minutes'
group by openphone_message_id
having count(*) > 1;
-- Expect: 0 rows. Any row here means the upsert key is wrong.

-- Queue drained, nothing stranded in the DLQ?
select
  (select count(*) from pgmq.q_campaign_sms)     as queue_depth,
  (select count(*) from pgmq.q_campaign_sms_dlq) as dlq_depth;
-- Expect: 0 and 0.


-- ═══════════════════════════════════════════════════════════════
-- D. Opt-out at dequeue — the property the whole design rests on
-- ═══════════════════════════════════════════════════════════════
-- Enqueue two messages for a run, then opt one recipient out BEFORE the
-- worker reaches them. Throttle 30s gives you the window.

-- update public.customers set marketing_status = 'opted_out',
--   opted_out_at = now(), opted_out_method = 'manual'
-- where id = '<SECOND_TEST_CUSTOMER_ID>';

select id, status, sent_count, skipped_opted_out_count
from public.campaign_runs where id = '<RUN_ID>';
-- Expect: sent_count 1, skipped_opted_out_count 1.
-- If skipped_opted_out_count is 0 and sent_count is 2, the guard is running
-- at enqueue instead of dequeue. That is the one failure mode that must not
-- ship — stop and fix before Phase 3.
