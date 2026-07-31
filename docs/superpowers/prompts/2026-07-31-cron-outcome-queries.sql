-- ============================================================================
-- CRON OUTCOME QUERIES — TidyWise
-- ============================================================================
-- READ ONLY. Nothing here writes. Run ONE SECTION AT A TIME.
--
-- WHY THESE AND NOT LIVENESS MONITORING
-- Every scheduled job in this project is a `net.http_post` to an edge function.
-- pg_cron therefore records whether the REQUEST succeeded, not whether the WORK
-- happened. A job that fires on time, gets a 200 back and does nothing at all
-- looks perfectly healthy in cron.job_run_details — which is the failure this
-- whole file exists to catch.
--
-- So each section asks the only question that actually matters:
--
--     "Is the world in the state this job is supposed to maintain?"
--
-- If the answer is yes, the job is working, whatever cron says. If the answer
-- is no, it is broken, whatever cron says.
--
-- HOW TO USE
-- Each section is self-contained. Copy one section, run it, read the HEALTHY /
-- BAD notes underneath. You will normally only want one.
--
-- CONTENTS
--   §1  Invoice overdue marking       ← start here; a sidebar badge depends on it
--   §2  The three send-queue tables
--   §3  PGMQ worker backlog
--   §4  Dead letter queues            ← nothing in the app surfaces these today
--   §5  Duplicate cron job names      ← only cron.job can answer this
--   §6  The three jobs with no meaningful outcome query (read, don't run)
-- ============================================================================


-- ============================================================================
-- §1  INVOICE OVERDUE MARKING
-- ----------------------------------------------------------------------------
-- Job:      send-invoice-payment-reminders  →  send-invoice-reminder
-- Maintains: invoices.status, flipping 'sent' → 'overdue' once due_date passes.
--
-- WHY THIS IS FIRST
-- The sidebar Invoices badge reads the STORED status, deliberately, so that it
-- and the Invoices page can never disagree (useSidebarBadges.ts). That decision
-- makes the badge only as correct as this cron. If the cron stops, the badge
-- does not go wrong loudly — it silently under-counts, and an owner sees fewer
-- overdue invoices than they have. That is money not chased.
--
-- The function's invariant, from send-invoice-reminder/index.ts:45-46:
--     .update({ status: "overdue" }).eq("status", "sent")   where due_date past
-- So: no invoice should sit in 'sent' with a due_date in the past.
-- ============================================================================

select
  count(*)                                                   as should_be_overdue_but_arent,
  min(due_date)                                              as oldest_missed,
  max(due_date)                                              as newest_missed,
  count(distinct organization_id)                            as orgs_affected,
  round(sum(total_amount)::numeric, 2)                       as dollars_not_being_chased
from public.invoices
where status = 'sent'
  and due_date < current_date;

--  HEALTHY: should_be_overdue_but_arent = 0.
--
--  BAD, and how to read it:
--    • A handful, all with due_date = yesterday → the job simply hasn't run yet
--      today. Check the schedule before assuming a fault.
--    • oldest_missed more than a few days back → the cron has been dead since
--      roughly that date. It is the best available estimate of when it stopped,
--      because nothing else records the attempt.
--    • dollars_not_being_chased is the number worth acting on. It is the value
--      of invoices whose owners have not been told they are late.
--
--  NOTE: only 'sent' is flipped. An invoice sitting in 'draft' past its due
--  date is not counted here and is not a cron failure — it is an invoice
--  nobody sent.


-- ============================================================================
-- §2  THE THREE SEND-QUEUE TABLES
-- ----------------------------------------------------------------------------
-- Jobs:     process-rebooking-reminders-hourly  → rebooking_reminder_queue
--           process-recurring-offers-hourly     → recurring_offer_queue
--           process-review-sms-queue-every-5-min→ automated_review_sms_queue
-- Maintains: rows move from queued (sent = false) to sent = true.
--
-- All three share the same core shape — send_at, sent, sent_at, error — so one
-- query covers them.
--
-- TWO EXCLUSIONS THAT MATTER
--   • `cancelled` — a cancelled row is not stuck, it is finished. Counting it
--     as a backlog would make a healthy queue look broken forever.
--   • `deferred_until` — a deferred row is deliberately waiting. Same problem.
--
-- ASYMMETRY, DELIBERATELY NOT PAPERED OVER: only rebooking_reminder_queue and
-- recurring_offer_queue have `cancelled` and `deferred_until`.
-- automated_review_sms_queue has neither column, so the union below supplies
-- literals for it. Do not "tidy" that into a shared reference to columns that
-- do not exist on all three tables.
-- ============================================================================

with q as (
  select 'rebooking_reminder_queue'   as queue, send_at, sent, error,
         cancelled, deferred_until
  from public.rebooking_reminder_queue
  union all
  select 'recurring_offer_queue',      send_at, sent, error,
         cancelled, deferred_until
  from public.recurring_offer_queue
  union all
  -- No cancelled / deferred_until columns on this one.
  select 'automated_review_sms_queue', send_at, sent, error,
         false, null::timestamptz
  from public.automated_review_sms_queue
)
select
  queue,
  count(*) filter (where not sent and not cancelled
                     and (deferred_until is null or deferred_until <= now())
                     and send_at <= now())                        as due_and_unsent,
  count(*) filter (where not sent and not cancelled
                     and (deferred_until is null or deferred_until <= now())
                     and send_at <= now() - interval '2 hours')   as overdue_2h,
  count(*) filter (where not sent and not cancelled
                     and (deferred_until is null or deferred_until <= now())
                     and send_at <= now() - interval '24 hours')  as overdue_24h,
  count(*) filter (where not sent and deferred_until > now())     as deferred_not_stuck,
  count(*) filter (where cancelled)                               as cancelled_ignore,
  count(*) filter (where error is not null and not sent)          as errored,
  min(send_at) filter (where not sent and not cancelled
                     and (deferred_until is null or deferred_until <= now()))
                                                                  as oldest_waiting
from q
group by queue
order by queue;

--  HEALTHY: overdue_2h = 0 on every row. due_and_unsent may be non-zero — that
--  is simply work that arrived since the last run, which is normal between
--  ticks on an hourly job.
--
--  BAD:
--    • overdue_2h > 0 on an HOURLY queue → it has missed at least two runs.
--    • overdue_24h > 0 → the worker is down, not slow. `oldest_waiting` dates
--      the failure.
--    • errored climbing while overdue stays 0 → the job IS running and the
--      sends are failing. A completely different problem, and one that liveness
--      monitoring would have called healthy. Read the `error` column.
--    • deferred_not_stuck should be ignored. It is here so you can see it is
--      being excluded rather than wonder whether it was.


-- ============================================================================
-- §3  PGMQ WORKER BACKLOG
-- ----------------------------------------------------------------------------
-- Jobs:     process-email-queue     → pgmq queue `auth_emails`
--           process-campaign-queue  → pgmq queue `campaign_sms`
-- Maintains: queue depth near zero; messages consumed shortly after arriving.
--
-- pgmq.metrics_all() reports every queue in one row each. `queue_length` is the
-- backlog; `newest_msg_age_sec` and `oldest_msg_age_sec` say whether it is
-- moving.
-- ============================================================================

select
  queue_name,
  queue_length,
  oldest_msg_age_sec,
  newest_msg_age_sec,
  total_messages
from pgmq.metrics_all()
order by queue_name;

--  HEALTHY: queue_length small and oldest_msg_age_sec small — seconds or low
--  minutes. A queue at 0 with total_messages climbing over time is perfect: it
--  means everything that arrives is consumed.
--
--  BAD:
--    • queue_length large AND oldest_msg_age_sec large and growing → the worker
--      is not consuming. For campaign_sms that is marketing texts not going
--      out; for auth_emails it is password resets and magic links not arriving,
--      which presents to users as "the site is broken" rather than as an email
--      problem.
--    • queue_length large but oldest_msg_age_sec SMALL → a burst, not a
--      failure. The worker is keeping up with new arrivals.
--    • oldest_msg_age_sec large while queue_length is 1 or 2 → a poison
--      message that cannot be processed and is blocking behind it. Check §4.
--
--  Run this twice a minute apart. A backlog that is falling is not an incident.


-- ============================================================================
-- §4  DEAD LETTER QUEUES
-- ----------------------------------------------------------------------------
-- NOTHING IN THE APP SURFACES THESE. There is no page, no badge, no alert.
-- A message here has been abandoned permanently and silently.
--
-- campaign_sms_dlq is the one that matters most: every row is a text a real
-- customer was supposed to receive and never will, and no one is told — not the
-- customer, not the business that scheduled it, not you.
-- ============================================================================

select
  queue_name,
  queue_length      as abandoned_messages,
  oldest_msg_age_sec,
  newest_msg_age_sec
from pgmq.metrics_all()
where queue_name like '%\_dlq' escape '\'
order by queue_length desc;

--  HEALTHY: every dlq at 0.
--
--  BAD, by queue:
--    • campaign_sms_dlq > 0     → customer texts permanently lost. Each row is
--                                 a message someone paid to send. Worth reading
--                                 the payloads before purging anything.
--    • auth_emails_dlq > 0      → password resets and magic links that never
--                                 arrived. Those users are locked out right now
--                                 and will have assumed the site is broken.
--    • transactional_emails_dlq → same shape; receipts and confirmations.
--
--  newest_msg_age_sec is the important one: a DLQ with old entries and nothing
--  recent is a historical incident. One gaining new entries is a live one.
--
--  To read the actual payloads (also read-only):
--      select * from pgmq.q_campaign_sms_dlq order by enqueued_at desc limit 20;


-- ============================================================================
-- §5  DUPLICATE CRON JOB NAMES
-- ----------------------------------------------------------------------------
-- Four jobs exist under two names each, because they were rescheduled under a
-- new name without the old one being removed:
--
--     sync-openphone-messages        vs  sync-openphone-messages-every-5-min
--     process-review-sms-queue       vs  process-review-sms-queue-every-5-min
--     demo-reminders-hourly          vs  demo-reminders-15min
--     blog-publisher-monday/thursday vs  blog-publisher-mon/tue/thu/sat
--
-- ONLY cron.job CAN ANSWER THIS. The migrations cannot: several jobs are
-- removed with `cron.unschedule(<numeric id>)` rather than by name, so the
-- files do not record which name survived. Reading them tells you what was
-- INTENDED, never what is live.
--
-- If both halves of a pair are active, that function runs twice per tick — for
-- the SMS ones that means duplicate texts to real customers.
-- ============================================================================

select
  jobid,
  jobname,
  schedule,
  active,
  case
    when jobname like 'sync-openphone-messages%'  then 'openphone sync'
    when jobname like 'process-review-sms-queue%' then 'review sms'
    when jobname like 'demo-reminders%'           then 'demo reminders'
    when jobname like 'blog-publisher%'           then 'blog publisher'
    else 'other'
  end                                             as pair_group
from cron.job
where jobname like 'sync-openphone-messages%'
   or jobname like 'process-review-sms-queue%'
   or jobname like 'demo-reminders%'
   or jobname like 'blog-publisher%'
order by pair_group, jobname;

--  HEALTHY: exactly ONE active row per pair_group — except blog publisher,
--  which is legitimately four (mon/tue/thu/sat).
--
--  BAD:
--    • Two active rows in one pair_group → that function runs twice every tick.
--      For 'review sms' and 'openphone sync' this means duplicate customer
--      texts. Unschedule the older name; do not disable both.
--    • blog-publisher-monday or blog-publisher-thursday still active alongside
--      the mon/tue/thu/sat set → Monday and Thursday publish twice.
--    • A pair_group with no rows at all → that job is not scheduled anywhere,
--      whatever the migrations imply.
--
--  The full picture, if you want it:
--      select jobid, jobname, schedule, active from cron.job order by jobname;


-- ============================================================================
-- §6  THE THREE JOBS WITH NO MEANINGFUL OUTCOME QUERY
-- ----------------------------------------------------------------------------
-- Nothing to run here. These are named rather than given an invented query,
-- because a query that cannot distinguish "working" from "idle" is worse than
-- no query — it produces a number that gets treated as a health signal.
--
-- 1. recurring-booking-lapse-alert
--    There is a config.toml entry at :84 and NO function directory. It was
--    unscheduled in a migration. Nothing is deployed, so there is nothing to
--    measure. The config entry is a leftover and should be deleted — that is a
--    cleanup, not a monitoring gap.
--
-- 2. abuse-throttle-cleanup
--    Same shape: unscheduled, and no function directory exists. Nothing to
--    measure.
--
-- 3. seasonal-promo-sender
--    This one is deployed and real, but it is SUPPOSED to do nothing most of
--    the year — it only sends inside a configured promo window. So zero sends
--    is the correct state the vast majority of the time, and no query can tell
--    "correctly quiet" from "broken". The only honest check is to look at it
--    deliberately when you have a promo running.
--
--    `demo-reminders` shares this shape: no demos booked means nothing to send,
--    so an empty result proves nothing. It is not listed as a fourth only
--    because it fires often enough that a long silence is at least suggestive.
--
-- Everything else DOES write local state and is covered above, including three
-- I initially assumed were unqueryable and were not: weekly-business-report
-- writes automation_fire_log, send-subscription-renewal-reminder writes
-- subscription_reminder_log, and sync-openphone-messages writes sms_messages.
-- ============================================================================
