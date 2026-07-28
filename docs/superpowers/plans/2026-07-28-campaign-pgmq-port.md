# Campaign Send: Port to PGMQ Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synchronous SMS send loop in `run-inactive-campaign` with a throttled, pausable, cancellable, genuinely-schedulable queue worker built on the PGMQ + self-arming pg_cron pattern already proven in production for email — and close the opt-out gap in the five marketing senders that currently bypass it.

**Architecture:** Campaign send becomes two halves. An *enqueue* half resolves the audience once and pushes one PGMQ message per recipient, then returns immediately. A *drain* half — a **self-arming** pg_cron dispatcher modelled on `email_queue_wake` / `email_queue_dispatch` — pops messages, re-checks opt-out at send time, sends, and records. Run state (`running`/`paused`/`cancelled`/`completed`) lives in a `campaign_runs` row the worker consults on every tick, which is what makes pause and cancel possible at all.

**Tech Stack:** Supabase Postgres + PGMQ 1.5.1 + pg_cron, Deno edge functions, OpenPhone SMS API, React + TanStack Query front end.

> **Revised 2026-07-28 after preflight.** An earlier draft of this plan said the email queue "runs on pg_cron" on a fixed schedule. That was wrong. There is no standing `process-email-queue` cron job. The real design is a self-arming/disarming dispatcher pair: an `AFTER INSERT` trigger on the pgmq queue tables arms a cron job, and the dispatcher unschedules itself once both queues drain. The absence of the job in `cron.job` means the system is correctly at rest, not broken. This plan now copies that pattern rather than the one I assumed existed.

---

## Global Constraints

**Ownership (from `CLAUDE.md`).** Lovable owns `supabase/`. A git push does not deploy an edge function or run a migration. Every task below that touches `supabase/` is written as a **paste-ready Lovable prompt**, not a local edit. Tasks marked *(Claude Code)* touch `src/` only and are committed normally.

**Copy the self-arming dispatcher pattern, not a standing cron.** Campaign runs are bursty — a permanently-armed job burning ticks against an empty queue is waste, and the codebase already has a better answer. Arm on enqueue, disarm when no run is active.

**Auth shape for the cron entry:** vault-based `supabase_url` + `supabase_service_role_key` + `x-cron-secret`, as `demo-reminders-15min` does. Do **not** copy the older jobs that inline the anon key.

**Opt-out is checked at dequeue, not enqueue.** This is the single most important correctness property in the plan. Throttled at 30–60s per message, a 300-recipient campaign runs for hours. A customer who texts STOP at minute 20 must not receive a message at minute 90. Enqueue-time filtering alone would violate the opt-out promise every template makes.

**Preserve, do not rewrite:** audience selection, `excludeAlreadyReceived` dedupe, `campaign_sms_sends` logging, `booking_link_tracking`, and the STOP webhook in `openphone-webhook`. These work. The send loop is what's being replaced.

**Verify each phase against the live DB** before starting the next. Ask Lovable to confirm *deployed*, not committed.

---

## File Structure

| File | Ownership | Responsibility |
|---|---|---|
| `supabase/migrations/<ts>_campaign_runs.sql` | Lovable | `campaign_runs` table, `automated_campaigns.throttle_seconds`, PGMQ queue creation |
| `supabase/migrations/<ts>_campaign_worker_cron.sql` | Lovable | pg_cron entry for the drain worker |
| `supabase/functions/_shared/marketing-guard.ts` | Lovable | `isOptedOut()` / `filterOptedIn()` — single source of opt-out truth |
| `supabase/functions/_shared/campaign-enqueue.ts` | Lovable | Audience resolution + PGMQ enqueue (extracted from `run-inactive-campaign`) |
| `supabase/functions/run-inactive-campaign/index.ts` | Lovable | Becomes enqueue-only; send loop deleted |
| `supabase/functions/process-campaign-queue/index.ts` | Lovable | **New.** The drain worker |
| `src/hooks/useCampaignRuns.ts` | Claude Code | Run status, progress, pause/cancel/resume mutations |
| `src/components/admin/campaigns/CampaignRunControls.tsx` | Claude Code | Pause / Resume / Cancel + live progress |
| `src/components/admin/campaigns/ThrottleSelect.tsx` | Claude Code | Throttle picker |
| `src/pages/admin/CampaignsPage.tsx` | Claude Code | Wire controls; schedule step writes a real timestamp |

`CampaignsPage.tsx` is 1,655 lines. New campaign UI goes in `src/components/admin/campaigns/`, not inline. Do not grow this file further.

---

## Phase 0 — Preflight ✅ COMPLETE (2026-07-28)

Results, and what each one changed:

| Checked | Result | Effect on plan |
|---|---|---|
| `automated_campaigns.scheduled_at` | **Absent.** Columns: id, name, type, subject, body, days_inactive, is_active, last_run_at, created_at, updated_at, organization_id. Repo-wide scan found only unrelated matches. | Phase 1 adds it. Unchanged. |
| PGMQ | **v1.5.1**, `pgmq` schema. Queues: `auth_emails`, `auth_emails_dlq`, `transactional_emails`, `transactional_emails_dlq` — all empty. Plus two `audit_probe` test leftovers holding 1 message each. | **Every real queue has a paired DLQ.** Phase 1 now creates `campaign_sms_dlq` too. |
| `process-email-queue` cron | **No such job.** 23 active jobs, none invokes it. Drained by `email_queue_wake` trigger + self-disarming `email_queue_dispatch`. | Architecture corrected. Phase 2 copies the self-arming pattern. |
| Cron template | `demo-reminders-15min` — `*/15 * * * *`, vault `supabase_url` + `supabase_service_role_key` + `x-cron-secret`. 18/18 jobs succeeded in 24h, zero failures. | Auth shape adopted. |
| Opt-out columns | All present. **45 opt-outs across two orgs** — the STOP path demonstrably works in production. | Confirms Phase 4 is a gap in *senders*, not in capture. |
| `log_org_email_send_failure` | Exists, SECURITY DEFINER. | Unchanged. |

### Cadence decision — reversed

The preflight conclusion "pg_cron is minute-granularity" does not hold. `email_queue_wake` already calls:

```sql
cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
```

pg_cron ≥ 1.5 accepts interval syntax, and this codebase relies on it. Sub-minute scheduling is available. The reason no such job is visible is that the queues are empty and the dispatcher unscheduled itself.

**So the worker does not need to space sends inside a tick.** The design keeps the `next_send_at` cursor regardless, because a cursor is cadence-independent: it enforces the exact throttle whether cron fires every 5s or every 60s, and it survives a cadence change without a code change. Cron cadence only has to be *finer than the smallest throttle*. Use `'15 seconds'` — comfortably under the 30s minimum throttle, and no per-tick sleeping, so the ~150s wall-clock ceiling stops being a design constraint at all.

- [x] **0.1** ✅ Preflight run, results recorded above.
- [x] **0.2** ✅ **Wake triggers confirmed attached and enabled** (2026-07-28):

| tgname | on_table | tgenabled |
|---|---|---|
| `email_queue_wake_auth` | `pgmq.q_auth_emails` | `O` (enabled) |
| `email_queue_wake_transactional` | `pgmq.q_transactional_emails` | `O` (enabled) |

The `to_regclass()` guard in migration `20260715180557` did not silently skip, despite the KNOWN GAP note in `20260716180500`. **The self-arming dispatcher pattern is live and proven end-to-end in production**, so Phase 2 is copying something that demonstrably works rather than something inferred from source. No email-queue bug. Phase 1 is unblocked.

- [ ] **0.3** Clean up the two `audit_probe` leftover queues (`pgmq.drop_queue`) so queue listings stay meaningful. Not blocking — can ride along with the Phase 1 migration.

---

## Phase 1 — Schema and queue (Lovable)

- [ ] **1.1** Create `campaign_runs` and add throttle config.

> **Lovable prompt:**
>
> Add a migration creating a `campaign_runs` table and a PGMQ queue for campaign SMS sends.
>
> `public.campaign_runs`:
> - `id uuid primary key default gen_random_uuid()`
> - `campaign_id uuid not null references automated_campaigns(id) on delete cascade`
> - `organization_id uuid not null references organizations(id) on delete cascade`
> - `status text not null default 'pending'` — check constraint in (`pending`,`running`,`paused`,`cancelled`,`completed`)
> - `cancel_reason text` — null unless status is `cancelled`; we use `'expired'`, `'user_cancelled'`
> - `throttle_seconds integer not null default 60` — check between 1 and 3600
> - `scheduled_at timestamptz` — null means send now
> - `expires_at timestamptz not null` — set to `scheduled_at + interval '24 hours'` (or `now() + 24h` for immediate sends)
> - `next_send_at timestamptz` — worker's throttle cursor
> - `total_recipients integer not null default 0`
> - `sent_count integer not null default 0`
> - `failed_count integer not null default 0`
> - `skipped_opted_out_count integer not null default 0`
> - `started_at`, `paused_at`, `completed_at` timestamptz
> - `created_at timestamptz not null default now()`
>
> Indexes: `(organization_id, status)`, and a partial index on `(next_send_at)` where `status = 'running'`.
>
> RLS: enable it. Members of the owning organization may select. Only the service role may insert or update — the worker and enqueue function run as service role, and no client should be able to flip a run's status directly. Add a `SECURITY DEFINER` RPC `set_campaign_run_status(_run_id uuid, _status text)` that authorizes the caller internally (verify `auth.uid()` is a member of the run's `organization_id` with an admin role) and only permits the transitions `running -> paused`, `paused -> running`, and `running|paused -> cancelled`. Grant EXECUTE on that RPC to `authenticated`; do **not** grant direct UPDATE on the table.
>
> Also add `throttle_seconds integer not null default 60` to `automated_campaigns` (the per-campaign default that seeds a run), and `scheduled_at timestamptz` for real scheduling.
>
> Create the PGMQ queues — both of them, matching the existing convention where every real queue has a paired dead-letter queue:
> ```sql
> select pgmq.create('campaign_sms');
> select pgmq.create('campaign_sms_dlq');
> ```
>
> Then deploy/run the migration and confirm it applied, not just committed.

- [ ] **1.2** Verify live: `campaign_runs` exists with the check constraints, both `campaign_sms` and `campaign_sms_dlq` appear in the queue list, and `set_campaign_run_status` is `prosecdef = true`. Confirm a plain `authenticated` role cannot UPDATE `campaign_runs` directly.

---

## Phase 2 — The drain worker (Lovable)

- [ ] **2.1** Create the shared opt-out guard first — Phase 4 reuses it.

> **Lovable prompt:**
>
> Create `supabase/functions/_shared/marketing-guard.ts` exporting:
>
> ```ts
> export async function isOptedOut(supabase, organizationId: string, customerId: string): Promise<boolean>
> export async function filterOptedIn<T extends { id: string }>(supabase, organizationId: string, customers: T[]): Promise<T[]>
> ```
>
> `isOptedOut` returns true when `customers.marketing_status = 'opted_out'` for that customer in that org. **Fail closed:** if the lookup errors, return `true` (treat as opted out) and log loudly. We would rather skip a message than send to someone who opted out — TCPA damages are per message.
>
> `filterOptedIn` does the same for a batch in one query, returning only customers whose `marketing_status` is not `'opted_out'`. If the query errors, return an empty array and log.
>
> Do not deploy anything else yet.

- [ ] **2.2** Create `process-campaign-queue`.

> **Lovable prompt:**
>
> Create edge function `process-campaign-queue`, modelled on the existing `process-email-queue` (same PGMQ read/delete/archive discipline, same retry-budget approach, same visibility-timeout handling). It takes no request body — cron invokes it.
>
> Each invocation:
> 1. Load all `campaign_runs` with `status in ('pending','running','paused')`.
> 2. **Expire first:** any run where `now() > expires_at` → set `status='cancelled'`, `cancel_reason='expired'`, `completed_at=now()`, and purge that run's messages from the queue. This runs before any send, so a stale run can never emit a message.
> 3. **Start:** `pending` runs whose `scheduled_at` is null or `<= now()` → set `status='running'`, `started_at=now()`, `next_send_at=now()`.
> 4. **Skip paused:** do not read messages for paused runs. Their queued messages stay in PGMQ untouched.
> 5. **Throttle:** for each `running` run where `now() >= next_send_at`, read exactly one message with `pgmq.read` (visibility timeout 120s). If none remain, set `status='completed'`, `completed_at=now()`. Otherwise send it, then set `next_send_at = now() + throttle_seconds`.
> 6. **Re-check opt-out at send time** using `isOptedOut` from `_shared/marketing-guard.ts`. If opted out: delete the message, increment `skipped_opted_out_count`, and do **not** send. This is required — a throttled campaign runs for hours and the customer may have texted STOP after enqueue.
> 7. Send via the OpenPhone API exactly as `run-inactive-campaign` does today (same personalisation tokens, same `+1` phone normalisation, same tracking-ref booking link).
> 8. On success: `pgmq.delete` the message, insert into `campaign_sms_sends` as today, insert `booking_link_tracking` when the template contains `{booking_link}`, increment `sent_count`.
> 9. **Also insert the outbound message into `sms_messages`** with the `openphone_message_id` returned by the API, so campaign sends appear in the Messages tab immediately instead of only when OpenPhone's webhook echoes back. Use an upsert keyed on `openphone_message_id` so the webhook does not create a duplicate.
> 10. On send failure: increment `failed_count`, let the message return to the queue via visibility timeout, and respect a retry budget as `process-email-queue` does. After the budget is exhausted, archive the message rather than looping forever.
>
> Never let one run's failure abort the others — wrap per-run work in try/catch and continue.
>
> Then deploy it and confirm deployed, not just committed.

- [ ] **2.3** Add the **self-arming** dispatcher pair — mirroring `email_queue_wake` / `email_queue_dispatch`, not a standing cron.

> **Lovable prompt:**
>
> Add a migration creating a self-arming/disarming pg_cron dispatcher for the campaign queue, modelled directly on the existing `public.email_queue_wake()` / `public.email_queue_dispatch()` pair.
>
> `public.campaign_queue_dispatch()` — `SECURITY DEFINER`, `SET search_path TO ''`:
> - If no `campaign_runs` row has `status in ('pending','running','paused')`, take the advisory lock, re-read under it (same race-avoidance as the email pair — use a **different** lock key, e.g. `7700000000000002`, so campaign and email dispatchers never block each other), and if still none, `cron.unschedule('process-campaign-queue')` and return.
> - Otherwise `net.http_post` to `process-campaign-queue`, using the vault-based auth shape from `demo-reminders-15min`: `supabase_url` and `supabase_service_role_key` from vault, plus the `x-cron-secret` header. Do not inline the anon key.
>
> `public.campaign_queue_wake()` — trigger function, `SECURITY DEFINER`, `SET search_path TO ''`:
> - Take the same advisory lock, and if no `process-campaign-queue` job exists, `cron.schedule('process-campaign-queue', '15 seconds', $cron$ SELECT public.campaign_queue_dispatch(); $cron$)`.
> - Then `net.http_post` once immediately so the first message goes out without waiting for a tick.
> - Wrap both in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING` exactly as `email_queue_wake` does — arming must never roll back the enqueue transaction.
>
> Attach it as `AFTER INSERT ... FOR EACH STATEMENT` on `campaign_runs` (not on the pgmq table — a run is created before its messages, and this way the trigger target is a table we own and that definitely exists).
>
> **Attach the trigger unconditionally in this migration.** Do not guard it behind `to_regclass()`. The email pair's trigger attachment was guarded that way, and a sibling migration records it as a KNOWN GAP that was never captured — do not repeat that.
>
> `REVOKE ALL` on both functions from `PUBLIC`.
>
> Then run the migration and confirm both functions and the trigger exist live.

- [ ] **2.4** Verify the arming works: insert a `campaign_runs` row by hand, confirm `process-campaign-queue` appears in `cron.job` within seconds, then cancel the run and confirm the job unschedules itself.
- [ ] **2.5** Verify live with a **single-recipient** run: confirm one message sends, `sent_count` reaches 1, status lands on `completed`, the message appears in `sms_messages`, and the cron job disarms afterwards. Do not proceed on a real audience until this passes.

---

## Phase 3 — Enqueue replaces the send loop (Lovable)

- [ ] **3.1** Extract audience resolution, then make `run-inactive-campaign` enqueue-only.

> **Lovable prompt:**
>
> Refactor `run-inactive-campaign` so it no longer sends anything. Keep all existing audience logic exactly as-is: the `targetAudience` branches (`inactive_clients`, `active_clients`, `cancelled_clients`, `all_customers`, `leads`), `daysInactive`, `onlyAfterDate`, `excludeAlreadyReceived` / `excludeRecentDays` dedupe against `campaign_sms_sends`, the `marketing_status = 'active'` filter, and the paginated customer fetch **including its `.order('id')` tiebreaker and its abort-on-error behaviour — do not regress those**.
>
> Replace the `for` loop that POSTs to OpenPhone with:
> 1. Create a `campaign_runs` row: `status='pending'`, `throttle_seconds` and `scheduled_at` from the request body (defaulting to the campaign's values), `expires_at = coalesce(scheduled_at, now()) + interval '24 hours'`, `total_recipients` = resolved audience size.
> 2. Enqueue one `campaign_sms` PGMQ message per recipient: `{ run_id, campaign_id, organization_id, customer_id, phone, first_name, last_name, message_template }`.
> 3. Return `{ runId, totalRecipients }` immediately.
>
> `testMode: true` must keep its current behaviour exactly — return the preview counts and sample customers, create no run, enqueue nothing.
>
> Accept an optional `recipientCustomerIds: string[]` in the body. When present, skip audience resolution and enqueue exactly those customers (still applying the opt-out filter). This is what a future targeted re-send will use — the capability the removed "Re-send to Abandoned" button lacked.
>
> Then deploy and confirm deployed.

- [ ] **3.2** Verify live in test mode first (counts unchanged from before the refactor), then with a real two-recipient audience.

---

## Phase 4 — Close the opt-out gap (Lovable)

Five marketing senders POST to OpenPhone without consulting `marketing_status`. Every template advertises "Reply STOP to opt out," so this gap breaks a promise the product makes in writing.

- [ ] **4.1** Apply the guard to each.

> **Lovable prompt:**
>
> Import `filterOptedIn` (or `isOptedOut` for single-recipient sends) from `_shared/marketing-guard.ts` and apply it immediately before the OpenPhone POST in each of these functions, skipping opted-out customers and logging each skip with the customer id:
>
> - `copilot-reengagement-cron`
> - `process-recurring-offers`
> - `followup-abandoned-booking`
> - `send-tip-request`
> - `process-review-sms-queue`
>
> These are marketing/promotional sends. Do **not** change transactional senders (`send-arrival-sms`, `send-on-the-way-sms`, `send-booking-reminder`, payment/invoice links, staff and admin notifications) — different consent basis, and gating those on marketing opt-out would suppress messages customers need.
>
> Then deploy all five and confirm each is deployed, not just committed.

- [ ] **4.2** Widen STOP matching in `openphone-webhook`.

> **Lovable prompt:**
>
> In `openphone-webhook`, the opt-out check normalises with `.replace(/[^A-Z]/g,'')` and then requires an exact keyword match, so `"stop"`, `"Stop"`, `"STOP."` and `"STOP!"` all work but `"stop texting me"` does not. Change it so a message also counts as opt-out when its **first word** (after the same normalisation) is one of the existing keywords. Keep every other behaviour identical — the 3× retry, and the `optOutDetected` gate on the AI auto-reply.
>
> Second fix in the same function: when neither `sms_conversations.customer_id` nor the most recent `campaign_sms_sends` row resolves a `customer_id`, the opt-out is currently skipped silently. Add a fallback that matches the sending phone number against `customers.phone` within that organization, and if it still cannot resolve, log at error level with the phone number so it can be handled manually.
>
> Then deploy and confirm deployed.

- [ ] **4.3** Verify live: text `stop` (lowercase) from a test number, confirm `marketing_status` flips to `opted_out`; then confirm a queued campaign run skips that customer and increments `skipped_opted_out_count`.

---

## Phase 5 — Front-end controls *(Claude Code — normal commits)*

- [ ] **5.1** `src/hooks/useCampaignRuns.ts` — query the active run for a campaign (poll every 5s while `status` is `running`), plus `pause`/`resume`/`cancel` mutations calling the `set_campaign_run_status` RPC. Commit.
- [ ] **5.2** `ThrottleSelect.tsx` — options 30s / 1 min / 2 min / 5 min, mapping to `throttle_seconds`. Commit.
- [ ] **5.3** `CampaignRunControls.tsx` — progress (`sent_count` / `total_recipients`), Pause/Resume/Cancel, and an explicit expiry line: *"Paused runs are cancelled automatically after 24 hours."* Show `cancel_reason = 'expired'` distinctly from a user cancel. Commit.
- [ ] **5.4** Wire into `CampaignsPage.tsx`: add `ThrottleSelect` to the wizard's schedule step; render `CampaignRunControls` on any campaign with an active run. Commit.
- [ ] **5.5** **Make the schedule step real.** Combine `scheduledDate` + `scheduledTime` into a timestamp and send it as `scheduled_at`. When `schedule === 'later'`, the primary button must read **"Schedule Campaign"**, not "Send Campaign". Today the date is displayed on the review screen and then discarded, and the button sends immediately — that is the most misleading bug in this feature. Commit.
- [ ] **5.6** Playwright spec in `tests/`: create a scheduled campaign, assert a `campaign_runs` row exists with `status='pending'` and the correct `scheduled_at`, and assert no `campaign_sms_sends` row was created. Commit.

---

## Separately tracked

### Email wake-trigger attachment — ✅ RESOLVED, no bug

Checked and closed 2026-07-28. Recorded here because the reasoning is worth keeping.

The queue drain design is sound: `email_queue_wake` arms a 5-second cron and `email_queue_dispatch` disarms it once both queues are empty, with an advisory lock serializing the two. Messages that fail and return via visibility-timeout keep the job armed, because `EXISTS (SELECT 1 FROM pgmq.q_*)` sees invisible rows too. Rate-limit backoff returns early *without* disarming.

The open risk was attachment, not design: migration `20260715180557` creates both triggers behind a `to_regclass()` guard that skips with a `RAISE NOTICE` if the queue tables don't exist yet, and `20260716180500` records *"KNOWN GAP: trigger attachment not captured."* Had the guard skipped, nothing would arm the cron and enqueued emails would sit indefinitely.

**Both triggers are present and enabled** (Phase 0.2). Queues sitting empty with no cron job is the system correctly at rest. Emails cannot silently strand through this path.

Worth noting for future work: this held by luck of migration ordering, not by construction. A rebuild that creates the queues *after* this migration would skip the triggers again and the failure would be silent. Hence the Phase 2 instruction to attach the campaign trigger unconditionally.

### Not in this plan

- **Invoice email error surfacing.** `InvoicesPage.tsx:250` and `InvoiceViewDialog.tsx:87` collapse every failure into supabase-js's generic "Edge Function returned a non-2xx status code". The send path itself works. Separate, small.
- **Discounts under Campaigns.** Nav/IA change, cosmetic.
- **Splitting `CampaignsPage.tsx`.** 1,655 lines. This plan adds only to new files; the split deserves its own pass.
- **Sharing a cron between campaigns and email.** Rejected — see below.

### Why the campaign worker gets its own dispatcher

Keeping them separate, for four reasons:

1. **Opposite latency goals.** Email arms at 5 seconds and wants to drain as fast as possible. Campaigns are deliberately slow — 30–60s between messages is the *feature*. One job cannot serve both without one of them compromising.
2. **Blast radius.** A campaign-worker bug must not be able to stall password-reset or auth emails. Those are the highest-consequence messages in the system.
3. **The disarm condition differs.** `email_queue_dispatch` unschedules when both *email* queues are empty. A shared job would need to reason about campaign run state too, turning two simple predicates into one compound one.
4. **Wall-clock budget.** Sharing means campaign send time counts against the same invocation that delivers transactional email.

They share the *pattern* and the vault auth shape — just not the job or the advisory lock key.

---

## Definition of done

1. A campaign with 50 recipients at 60s throttle takes ~50 minutes and never blocks the UI.
2. Pause stops sending within one cron tick; queued messages survive; resume continues from where it stopped.
3. The cron job arms on run creation and disarms when no run is active — no standing job against an empty queue.
4. A run paused for 24 hours flips to `cancelled` with `cancel_reason='expired'` and is visibly cancelled in the UI, not silently dropped.
5. A customer who texts `stop` mid-run receives no further messages from that run.
6. None of the five Phase 4 senders can message an opted-out customer.
7. Choosing "later" schedules; it does not send immediately.
8. Campaign sends appear in the Messages tab at send time, not on webhook echo.
9. `npx tsc --noEmit -p tsconfig.app.json` clean; QA suite green.
