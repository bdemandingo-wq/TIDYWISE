# What would it take to watch the cron jobs?

**Asked:** 2026-07-31 — shape only, before deciding whether to build.
**Decided:** outcome signals, watchdog deferred. The query list is in
`docs/investigations/2026-07-31-cron-outcome-queries.md`, which also revises the
heartbeat recommendation below from four jobs to none.
**Prompted by:** the invoices overdue badge now reads a stored status that only
`send-invoice-payment-reminders` maintains, and nothing alerts if that job stops.

---

## What is actually scheduled — and why nobody can answer that from the repo

**25 distinct job names across 32 `cron.schedule(` call sites. 15 of those names have
been `cron.unschedule`d at some point.**

That churn is the first finding, not a footnote. Jobs get renamed and superseded —
`blog-publisher-monday` → `blog-publisher-mon`, `demo-reminders-hourly` →
`demo-reminders-15min`, `process-review-sms-queue` →
`process-review-sms-queue-every-5-min`, `sync-openphone-messages` →
`sync-openphone-messages-every-5-min`. And `20260723021110…sql` unschedules six jobs by
**numeric jobid**, which is positional and whose accompanying comments are claims rather
than evidence.

**So the migration files cannot tell you what is running.** Only `cron.job` can. Any
monitoring has to start by establishing that list, which is itself a question the repo
currently cannot answer — and is a decent argument for doing this regardless of the
badge.

## Three failure modes, and they need different answers

**1. The job ran and errored.** `cron.job_run_details.status = 'failed'`, with
`return_message`. Easy — a query away, and pg_cron records it for free.

**2. The job ran, cron called it a success, and nothing happened.** This is the one that
matters and the one a naive watchdog misses. Every job here is
`net.http_post(...)`; cron records success when the **POST** succeeds, regardless of what
the edge function then did. A function that 500s, or returns 200 having silently
processed nothing, looks identical to a healthy run.

**This is exactly the case affecting the overdue badge.** "The cron is alive" means the
request fired. It does not mean any invoice got flipped from `sent` to `overdue`.
Watching cron status would not have protected that badge.

**3. The job is not scheduled at all.** No rows, no failures — silence. Undetectable by
watching for failures, because there is nothing to watch. You have to watch for
**absence**, which requires knowing what *should* exist.

Failure mode 3 is what the rename churn above produces, and failure mode 2 is what the
`x-webhook-secret` and blog-generator situations both looked like from outside.

## The shape, cheapest first

### A. A query you run when you think of it — zero build

```sql
select j.jobid, j.jobname, j.schedule, j.active,
       r.status, r.start_time, left(coalesce(r.return_message,''), 120) as last_message
from cron.job j
left join lateral (
  select status, start_time, return_message from cron.job_run_details d
  where d.jobid = j.jobid order by d.start_time desc limit 1
) r on true
order by j.active desc, r.start_time desc nulls first;
```

Catches modes 1 and 3 **when you remember to look**, which is the flaw. Worth running
once now regardless, because it answers "what is actually scheduled" — and that answer
does not exist anywhere today.

### B. A `cron-health` watchdog — the real option

One table, one edge function, one cron entry.

- **`expected_cron_jobs`** — `job_name`, `max_silence_minutes`, `enabled`, `notes`.
  Hand-seeded from the query above once you have looked at it. This table is what makes
  mode 3 detectable: a job missing from `cron.job` but present here is an alert.
- **`cron-health`** — runs every 30 minutes and raises an alert when any of:
  - a job in `expected_cron_jobs` has no matching row in `cron.job`, or has `active = false`
  - its most recent run is `failed`
  - its most recent successful run is older than `max_silence_minutes`
- **Where alerts go:** `admin_system_notifications` already exists and is already written
  to by `zapier-dispatch:86` and `notify-time-off-request:42`, so the surface is there.
  Add email via Resend for anything unacknowledged after an hour.

**The recursion problem, which has to be named:** the watchdog is itself a cron job. If
it stops, nothing tells you, and you are back where you started with one extra table.

The only real answer is a **dead-man's switch**: `cron-health` pings an external service
on every successful run (healthchecks.io, Better Stack, Cronitor — all have free tiers),
and *that* service alerts when the ping stops arriving. It is the one piece that cannot
live inside the system it is watching. Without it, this is monitoring that fails silently
in precisely the way it exists to prevent.

### C. Outcome heartbeats — the only thing that catches mode 2

`cron-health` above still cannot tell that a job ran and did nothing. For that, the job
has to report its own work:

- a `job_heartbeats` table: `job_name`, `last_success_at`, `last_result jsonb`
- each function writes one row on completion, with a count of what it did
- `cron-health` then alerts on a stale heartbeat, or on a run that reported zero work
  where zero is implausible

This is more invasive — it touches each function — so it is worth doing **selectively**,
for jobs where "ran but did nothing" is the real risk. On today's evidence that is:
`send-invoice-payment-reminders` (the overdue badge), `process-campaign-queue` and
`process-email-queue` (money and customer messages), and `generate-daily-blogs` (which
silently does nothing when the keyword queue is empty).

## What I would actually do

**A now** — run the query, find out what is scheduled. Free, and it answers a question
nobody can currently answer.

**B next, with the dead-man's switch from the start.** Skipping the external ping makes
it monitoring that cannot detect its own death, which is worse than none because it
feels like coverage.

**C only for the four jobs above.** Not a sweep.

**Rough cost:** A is minutes. B is a table, a function, a cron entry and a free external
account — half a day, most of it deciding `max_silence_minutes` per job. C is roughly an
hour per function.

## One thing worth deciding first

For the overdue badge specifically, the useful signal is **not** liveness at all. It is
an outcome check:

```sql
select count(*) from public.invoices
where status = 'sent' and due_date is not null and due_date < current_date;
```

If that is ever non-zero, the reminder job is not doing its work — whatever cron says
about it. That single query, on a schedule, protects the badge more directly than
watching the job that feeds it, and it is a five-minute addition to any watchdog rather
than a reason to build one.

It also generalises: for most of these jobs there is an equivalent "is the world in the
state this job is supposed to maintain?" query, and those are cheaper and more truthful
than liveness checks. Worth writing that list before building B, because it may change
what B needs to do.
