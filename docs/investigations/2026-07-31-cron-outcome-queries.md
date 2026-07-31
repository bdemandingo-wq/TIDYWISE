# Outcome queries — "is the world in the state this job maintains?"

**Written:** 2026-07-31. Read-only; nothing here changes anything.
**Approach chosen:** outcome signals over liveness. A job that POSTs, returns 200 and does
nothing is invisible to cron, and that is the failure mode that matters.
**Background:** `docs/investigations/2026-07-31-cron-monitoring-shape.md`

Every query below is written against **verified column names**, not plausible ones. Where
a job has no meaningful outcome, it says so rather than inventing one.

---

## The scheduled jobs, and what each maintains

| Job | Schedule | Function | Outcome query? |
|---|---|---|---|
| `send-invoice-payment-reminders` | 09:00 daily | `send-invoice-reminder` | ✅ **the badge one** |
| `process-review-sms-queue` | */5 min | `process-review-sms-queue` | ✅ queue drain |
| `process-rebooking-reminders-hourly` | hourly | `process-rebooking-reminders` | ✅ queue drain |
| `process-recurring-offers-hourly` | hourly | `process-recurring-offers` | ✅ queue drain |
| `process-email-queue` | every 5s | `process-email-queue` | ✅ PGMQ depth |
| `process-campaign-queue` | every 15s | `process-campaign-queue` | ✅ PGMQ depth |
| `send-booking-reminders` | */15 min | `send-booking-reminder` | ✅ gap check |
| `demo-reminders-15min` | */15 min | `demo-reminders` | ✅ gap check |
| `blog-publisher-*` (4 jobs) | Mon/Tue/Thu/Sat 10:00 | `generate-daily-blogs` | ⚠️ weak — see notes |
| `abuse-throttle-cleanup` | 05:00 daily | *(inline SQL)* | ✅ retention check |
| `sync-openphone-messages` | */5 min | `sync-openphone-messages` | ⚠️ weak — see notes |
| `quote-stale-reengage` | 10:00 daily | `quote-stale-reengage` | ⚠️ weak — see notes |
| `seasonal-promo-sender` | 09:00 daily | `seasonal-promo-sender` | ❌ **none — it just sends** |
| `send-subscription-renewal-reminder` | 14:00 daily | same | ❌ **none — it just sends** |
| `weekly-business-report-monday` | Mon 13:00 | `weekly-business-report` | ❌ **none — it just sends** |

**Not included:** `recurring-booking-lapse-alert` is **deliberately unscheduled** and its
function directory does not exist — `20260725160000…sql` and `20260725170000…sql` both
unschedule it with comments saying so. Nothing to watch.

**Also note the duplicate names**: `blog-publisher-mon`/`-monday`,
`demo-reminders-15min`/`-hourly`, `process-review-sms-queue`/`-every-5-min`,
`sync-openphone-messages`/`-every-5-min`. Each pair is one job renamed. Only `cron.job`
can say which survives — worth resolving before wiring any of this up.

---

## 1. The invoice one — start here

```sql
-- send-invoice-payment-reminders maintains: invoices past their due date carry
-- status 'overdue' rather than 'sent'. The Invoices page's Overdue card and the
-- sidebar badge both read that stored status, so if this is non-zero both are
-- silently under-reporting.
select count(*)          as stuck_as_sent,
       min(due_date)     as oldest_missed,
       current_date - min(due_date) as days_behind
from public.invoices
where status = 'sent'
  and due_date is not null
  and due_date < current_date;
```

**Expected: 0.** Anything else means the job is not doing its work, whatever cron says
about it. `days_behind` distinguishes "missed one run" from "stopped weeks ago".

Note the job only promotes `sent`, never `draft` — an unsent invoice is not overdue —
so drafts are correctly excluded from this check too.

## 2. The three `*_queue` tables — one shape, three jobs

All three share `send_at`, `sent` (boolean), `sent_at`, `error`. The signal is identical:
**a row whose `send_at` has passed and which is still unsent.**

```sql
-- process-review-sms-queue (*/5 min) — allow 15 minutes of slack
select 'review_sms' as queue, count(*) as overdue_unsent,
       min(send_at) as oldest, max(error) as a_sample_error
from public.automated_review_sms_queue
where not sent and send_at < now() - interval '15 minutes'

union all

-- process-rebooking-reminders (hourly) — allow 2 hours
select 'rebooking', count(*), min(send_at), max(error)
from public.rebooking_reminder_queue
where not sent and not cancelled
  and coalesce(deferred_until, send_at) < now() - interval '2 hours'

union all

-- process-recurring-offers (hourly) — allow 2 hours
select 'recurring_offers', count(*), min(send_at), max(error)
from public.recurring_offer_queue
where not sent and not cancelled
  and coalesce(deferred_until, send_at) < now() - interval '2 hours';
```

The two reminder queues also carry `cancelled` and `deferred_until`, both excluded above —
a deferred row is not a stuck row, and counting it would produce a permanent false alarm.

**`a_sample_error` matters:** rows stuck *with* an error are a different problem from rows
stuck with none. The first means the job ran and failed on them; the second means it never
looked.

## 3. The two PGMQ workers — depth and age

`pgmq` is installed (`20260428175052_email_infra.sql:13`), so queue depth is directly
queryable. Queues are `auth_emails` and `campaign_sms`, each with a `_dlq`.

```sql
select queue_name, queue_length, oldest_msg_age_sec, total_messages
from pgmq.metrics_all()
where queue_name in ('auth_emails','campaign_sms','auth_emails_dlq','campaign_sms_dlq');
```

**This is better than a heartbeat**, which is why I have changed my mind about these two —
see the last section. Depth answers "is it keeping up" and `oldest_msg_age_sec` answers "is
it moving at all". A worker that runs every 5 seconds and returns 200 having processed
nothing shows up immediately as a rising `oldest_msg_age_sec`, which no liveness check
would catch.

**Watch the DLQs separately.** Anything in `campaign_sms_dlq` is a customer message that
was permanently abandoned, and nothing currently surfaces that.

## 4. Gap checks — where the job should have produced a row and did not

```sql
-- send-booking-reminders (*/15 min): bookings inside the reminder window with no
-- booking_reminder_log row. Adjust the window to whatever the function actually uses.
select count(*) as bookings_missing_reminder, min(b.scheduled_at) as earliest
from public.bookings b
where b.status in ('confirmed','pending')
  and b.scheduled_at between now() + interval '23 hours' and now() + interval '25 hours'
  and not exists (
    select 1 from public.booking_reminder_log l
    where l.booking_id = b.id and l.status = 'sent'
  );

-- demo-reminders (*/15 min): same shape against demo_bookings / demo_reminder_log.
```

**Caveat, stated rather than hidden:** these depend on the function's actual reminder
window, which I have not read closely enough to pin. Confirm the interval before trusting
the number, or it will alarm on bookings that were never due a reminder.

## 5. Retention check

```sql
-- abuse-throttle-cleanup (05:00 daily, inline SQL): old throttle rows should not
-- accumulate. Set the interval to whatever the cleanup actually retains.
select count(*) as stale_rows, min(created_at) as oldest
from public.abuse_throttle
where created_at < now() - interval '7 days';
```

---

## Where the signal is weak, and why

**`generate-daily-blogs`** — its outcome is "a post got written", but it deliberately does
nothing when no keyword is queued, which is indistinguishable from failure:

```sql
select count(*) filter (where status = 'queued')                      as still_queued,
       min(created_at) filter (where status = 'queued')               as oldest_queued,
       max(updated_at) filter (where status = 'completed')            as last_completed
from public.blog_keyword_queue;
```

`last_completed` older than the most recent scheduled run **while** `still_queued > 0` is
a real signal. Either condition alone is not — an empty queue is a content problem, not a
job problem.

**`sync-openphone-messages`** — the outcome is "inbound messages appear", but a quiet
period is legitimate. Best available is staleness of the newest inbound row, and the
threshold is a guess about your message volume rather than a fact. Prone to false alarms
overnight and at weekends.

**`quote-stale-reengage`** — writes to `automation_fire_log`, so you could look for stale
quotes with no fire-log row. But eligibility depends on org opt-in and on the quote ageing
into the window, so a zero is usually correct and the query mostly restates the function's
own logic. Low value.

## Jobs with no meaningful outcome query — they genuinely just send

Three, and I would not invent a check for any of them:

- **`seasonal-promo-sender`** — sends a promo. Nothing is left behind whose absence means
  failure. Whether a promo went out on a given day is a marketing question, not a state one.
- **`send-subscription-renewal-reminder`** — a courtesy email before renewal. Stripe renews
  regardless; the reminder not going out costs goodwill, not correctness.
- **`weekly-business-report-monday`** — an owner-facing digest. Its absence is noticed by
  the owner, which is the cheapest monitoring there is.

For these three, **liveness is the only signal available**, and it is worth exactly what it
costs — which is an argument for the watchdog later, not for a fake outcome query now.

---

## The four I meant for heartbeats — and I would now say two

When I said four, I meant `send-invoice-payment-reminders`, `process-campaign-queue`,
`process-email-queue` and `generate-daily-blogs`.

**Working through the outcome queries changed that.** Two of them turn out to have
outcome signals strictly better than a heartbeat:

- **`send-invoice-payment-reminders`** — §1 answers it exactly. A heartbeat would say "I
  ran"; the query says "and the invoices are correct". Strictly more informative, and
  zero code in the function.
- **`process-email-queue` / `process-campaign-queue`** — `pgmq.metrics_all()` gives depth
  and oldest-message age without touching either function. A heartbeat would tell you the
  worker woke up; the depth tells you whether it is winning.

So heartbeats are worth it for the ones where **no external artefact proves the work
happened**:

1. **`seasonal-promo-sender`** — sends and leaves nothing behind
2. **`weekly-business-report`** — same, though the owner noticing is a real fallback

And honestly, at that point it is two jobs whose failure is a missed marketing email. **My
revised recommendation is: build none of the heartbeats.** Do §1 through §5 as queries,
which cost nothing to write and cover everything that affects money, customer messages or
data correctness — and leave the three send-only jobs to the watchdog if you ever build it.

The invoice query alone discharges the thing that prompted this.
