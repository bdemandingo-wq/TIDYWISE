-- Phase 3 verification — run-inactive-campaign is now enqueue-only
-- Run AFTER 3.1 is deployed. Continues the block lettering from the Phase 2
-- file (which ended at F).
--
-- Blocks G and H send NOTHING. Block I sends real SMS. J and K are targeted.
-- Read each block's header before running it.

-- ═══════════════════════════════════════════════════════════════
-- G. testMode must create nothing        (RISK CHECK 1 — no sends)
-- ═══════════════════════════════════════════════════════════════
-- The wizard fires testCampaign on a 400ms debounce every time you touch an
-- audience filter, and it shares this function. If the refactor creates a
-- campaign_runs row in test mode, every keystroke arms the dispatcher and
-- queues a phantom run.

-- G1. Baseline BEFORE touching the UI.
select
  (select count(*) from public.campaign_runs)   as runs_before,
  (select count(*) from pgmq.q_campaign_sms)    as queued_before,
  (select count(*) from cron.job
     where jobname = 'process-campaign-queue')  as cron_armed_before;
-- Note these three numbers.

-- G2. NOW, in the app: open the Campaigns wizard, go to the audience step,
--     and change the filters several times — days-inactive, audience type,
--     the exclude toggles. Let the recipient-count preview refresh each
--     time. Do NOT click Send. Then close the wizard.

-- G3. Re-run G1. All three numbers must be UNCHANGED.
select
  (select count(*) from public.campaign_runs)   as runs_after,
  (select count(*) from pgmq.q_campaign_sms)    as queued_after,
  (select count(*) from cron.job
     where jobname = 'process-campaign-queue')  as cron_armed_after;
-- Any increase means testMode is creating runs. Stop — that would mean the
-- audience preview silently queues messages.

-- G4. Belt and braces: nothing created in the last 10 minutes at all.
select id, status, total_recipients, created_at
from public.campaign_runs
where created_at > now() - interval '10 minutes'
order by created_at desc;
-- Expect: 0 rows.


-- ═══════════════════════════════════════════════════════════════
-- H. Queued payload integrity            (RISK CHECK 2 — no sends)
-- ═══════════════════════════════════════════════════════════════
-- Tokens must still be LITERAL in the queue. The worker resolves them at
-- send time and generates a fresh tracking ref per recipient. If the enqueue
-- resolved them instead, every recipient in a run would share one tracking
-- ref and link attribution would collapse into a single row.
--
-- Trick: schedule the run far in the future. Enqueue happens at creation,
-- but the run stays 'pending' and the worker never starts it, so the
-- messages sit in the queue for inspection and nothing can send.

-- H1. Invoke the function with a far-future scheduled_at. Replace the ids.
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
         || '/functions/v1/run-inactive-campaign',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                   where name = 'supabase_service_role_key'),
    -- Required. run-inactive-campaign's auth gate accepts EITHER a valid
    -- x-cron-secret OR an authenticated org admin. A service-role bearer is
    -- neither — it has no auth.uid(), so verifyOrgAccess would reject it.
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                      where name = 'cron_secret')
  ),
  body := jsonb_build_object(
    'organizationId',  '<ORG_ID>',
    'campaignId',      '<CAMPAIGN_ID>',
    'targetAudience',  'active_clients',
    'daysInactive',    30,
    'message',         'Hi {first_name}! This is {company_name}. {booking_link} Reply STOP to opt out.',
    'testMode',        false,
    'scheduledAt',     (now() + interval '7 days')::text
  ),
  timeout_milliseconds := 30000
);

-- H2. Read the response (pg_net is async).
select id, status_code, content::jsonb as body, created
from net._http_response order by created desc limit 1;
-- Expect: 200 with { runId, totalRecipients }.

-- H3. The run must be pending and NOT started.
select id, status, total_recipients, scheduled_at, started_at, expires_at
from public.campaign_runs order by created_at desc limit 1;
-- Expect: status 'pending', started_at NULL, scheduled_at ~7 days out,
--         expires_at = scheduled_at + 24h (NOT now + 24h).

-- H4. ⭐ THE PAYLOAD CHECK. Tokens must be literal.
select
  (message->>'run_id')            as run_id,
  (message->>'customer_id')       as customer_id,
  (message->>'first_name')        as first_name,
  (message->>'message_template')  as message_template
from pgmq.q_campaign_sms
limit 5;
-- Expect message_template to still read literally:
--   'Hi {first_name}! This is {company_name}. {booking_link} Reply STOP...'
-- with the braces INTACT and identical across every row.
--
-- FAIL if you see a real name substituted in, or a booking URL in place of
-- {booking_link}. That means substitution moved to enqueue time.

-- H5. Same check, stated as an assertion.
select
  count(*)                                                        as total_msgs,
  count(*) filter (where message->>'message_template' like '%{first_name}%')  as literal_first_name,
  count(*) filter (where message->>'message_template' like '%{booking_link}%') as literal_booking_link,
  count(distinct message->>'message_template')                    as distinct_templates
from pgmq.q_campaign_sms;
-- Expect: literal_first_name = total_msgs, literal_booking_link = total_msgs,
--         distinct_templates = 1 (one template shared by all recipients).

-- H6. Payload contract — every field the worker reads must be present.
select count(*) as messages_missing_a_required_field
from pgmq.q_campaign_sms
where message->>'run_id'           is null
   or message->>'campaign_id'      is null
   or message->>'organization_id'  is null
   or message->>'customer_id'      is null
   or message->>'phone'            is null
   or message->>'message_template' is null;
-- Expect: 0.

-- H7. total_recipients matches what was actually queued.
--     This verifies the OUTCOME of setting it in the INSERT. It cannot prove
--     the ordering by itself — only reading the function source can — but a
--     mismatch here is a definite bug.
select
  r.id,
  r.total_recipients,
  (select count(*) from pgmq.q_campaign_sms q
     where q.message->>'run_id' = r.id::text) as actually_queued
from public.campaign_runs r
order by r.created_at desc limit 1;
-- Expect: equal.

-- H8. Phone numbers normalised, and no opted-out customer queued.
select count(*) as bad_phone_format
from pgmq.q_campaign_sms
where message->>'phone' !~ '^\+[0-9]{11,15}$';
-- Expect: 0.

select count(*) as opted_out_but_queued
from pgmq.q_campaign_sms q
join public.customers c on c.id = (q.message->>'customer_id')::uuid
where c.marketing_status = 'opted_out';
-- Expect: 0. (The worker re-checks anyway, but enqueue should not include them.)

-- H9. CLEAN UP — cancel the run and drain its messages. Do this before
--     moving on, or it will sit pending for 7 days keeping the cron armed.
select public.set_campaign_run_status('<H_RUN_ID>', 'cancelled');

-- Then confirm the queue is clear and the cron disarmed.
select
  (select count(*) from pgmq.q_campaign_sms) as queue_depth,
  (select count(*) from cron.job where jobname = 'process-campaign-queue') as cron_armed;
-- Expect: 0 and 0. If messages remain, purge them:
--   select pgmq.delete('campaign_sms', msg_id) from pgmq.q_campaign_sms;


-- ═══════════════════════════════════════════════════════════════
-- I. End-to-end, small real audience   ⚠️ SENDS REAL SMS
-- ═══════════════════════════════════════════════════════════════
-- Use recipientCustomerIds with TWO test customers whose phones you own.
-- This is now the safe way to do a real end-to-end test — it was impossible
-- before 3.1, which is why the old "Re-send to Abandoned" button was
-- dangerous.

-- I1. Enqueue an explicit two-person run at a 30s throttle.
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
         || '/functions/v1/run-inactive-campaign',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                   where name = 'supabase_service_role_key'),
    -- Required. run-inactive-campaign's auth gate accepts EITHER a valid
    -- x-cron-secret OR an authenticated org admin. A service-role bearer is
    -- neither — it has no auth.uid(), so verifyOrgAccess would reject it.
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                      where name = 'cron_secret')
  ),
  body := jsonb_build_object(
    'organizationId',        '<ORG_ID>',
    'campaignId',            '<CAMPAIGN_ID>',
    'message',               'Phase 3 test for {first_name}. Reply STOP to opt out.',
    'testMode',              false,
    'throttleSeconds',       30,
    'recipientCustomerIds',  jsonb_build_array('<TEST_CUSTOMER_1>', '<TEST_CUSTOMER_2>')
  ),
  timeout_milliseconds := 30000
);

select id, status_code, content::jsonb as body from net._http_response
order by created desc limit 1;
-- Expect: 200, totalRecipients = 2.

-- I2. Watch it progress. Run this a few times over ~90 seconds.
select id, status, total_recipients, sent_count, failed_count,
       skipped_opted_out_count, next_send_at, started_at, completed_at
from public.campaign_runs where id = '<I_RUN_ID>';
-- Expect: sent_count climbs 0 -> 1 -> 2 roughly 30s apart, then
--         status 'completed'. The two texts should arrive ~30s apart.

-- I3. Personalisation resolved AT SEND TIME, per recipient.
select customer_id, phone_number, message_content, sent_at
from public.campaign_sms_sends
where campaign_id = '<CAMPAIGN_ID>'
order by sent_at desc limit 2;
-- Expect: each message_content has the REAL first name substituted, and the
-- two rows differ from each other. No literal {first_name} here — that is
-- the inverse of H4. Literal braces at H4, resolved values here.

-- I4. Distinct tracking refs per recipient.
select customer_id, tracking_ref, link_sent_at
from public.booking_link_tracking
where campaign_id = '<CAMPAIGN_ID>'
order by link_sent_at desc limit 2;
-- Expect: 2 rows, DIFFERENT tracking_ref values. Identical refs would mean
-- the ref was generated once at enqueue instead of per send.

-- I5. Mirrored to sms_messages at send time, no duplicates after the webhook.
select openphone_message_id, count(*) as rows
from public.sms_messages
where created_at > now() - interval '15 minutes'
group by openphone_message_id having count(*) > 1;
-- Expect: 0 rows.

-- I6. Queue drained, cron disarmed.
select
  (select count(*) from pgmq.q_campaign_sms)     as queue_depth,
  (select count(*) from pgmq.q_campaign_sms_dlq) as dlq_depth,
  (select count(*) from cron.job where jobname = 'process-campaign-queue') as cron_armed;
-- Expect: 0, 0, 0.


-- ═══════════════════════════════════════════════════════════════
-- J. recipientCustomerIds still honours opt-out       (no sends)
-- ═══════════════════════════════════════════════════════════════
-- An explicit list must not become a way to bypass opt-out.

-- J1. Opt one test customer out.
update public.customers
   set marketing_status = 'opted_out', opted_out_at = now(), opted_out_method = 'manual'
 where id = '<TEST_CUSTOMER_2>';

-- J2. Request BOTH customers explicitly, scheduled far out so nothing sends.
--     (Same net.http_post as I1, plus 'scheduledAt' 7 days out.)

-- J3. Only the opted-in customer should have been queued.
select id, total_recipients from public.campaign_runs order by created_at desc limit 1;
-- Expect: total_recipients = 1, not 2.

select message->>'customer_id' as queued_customer from pgmq.q_campaign_sms;
-- Expect: only <TEST_CUSTOMER_1>.

-- J4. Clean up: cancel the run, drain the queue, restore the customer.
select public.set_campaign_run_status('<J_RUN_ID>', 'cancelled');
update public.customers set marketing_status = 'active',
       opted_out_at = null, opted_out_method = null
 where id = '<TEST_CUSTOMER_2>';


-- ═══════════════════════════════════════════════════════════════
-- K. Audience regressions                             (no sends)
-- ═══════════════════════════════════════════════════════════════
-- The refactor was supposed to leave audience logic untouched. Compare
-- against testMode, which still previews without creating anything.

-- K1. In the app: open the wizard, pick an audience, note the previewed
--     recipient count. Then run the same parameters for real with a
--     far-future scheduledAt.

-- K2. total_recipients must equal the previewed count.
select id, total_recipients, scheduled_at from public.campaign_runs
order by created_at desc limit 1;

-- K3. Dedupe still applied — with excludeAlreadyReceived true, nobody in the
--     queue should already have a campaign_sms_sends row for this campaign.
select count(*) as already_received_but_queued
from pgmq.q_campaign_sms q
join public.campaign_sms_sends s
  on s.customer_id = (q.message->>'customer_id')::uuid
 and s.campaign_id = '<CAMPAIGN_ID>';
-- Expect: 0 when excludeAlreadyReceived was true.

-- K4. Clean up.
select public.set_campaign_run_status('<K_RUN_ID>', 'cancelled');
select
  (select count(*) from pgmq.q_campaign_sms) as queue_depth,
  (select count(*) from cron.job where jobname = 'process-campaign-queue') as cron_armed;
-- Expect: 0 and 0.


-- ═══════════════════════════════════════════════════════════════
-- Not covered here
-- ═══════════════════════════════════════════════════════════════
-- Partial-enqueue failure (non-2xx with the enqueued count) cannot be forced
-- from SQL without breaking something on purpose. Phase 2 Block E already
-- proved the downstream behaviour: a run whose recipients never fully land
-- stall-cancels as 'enqueue_stalled' within 5 minutes. The new non-2xx
-- return is an additional immediate signal on top of that, not the only
-- protection.
