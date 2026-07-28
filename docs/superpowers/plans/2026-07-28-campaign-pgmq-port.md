# Campaign Send: Port to PGMQ Queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synchronous SMS send loop in `run-inactive-campaign` with a throttled, pausable, cancellable, genuinely-schedulable queue worker built on the PGMQ + pg_cron pattern already running in production for email — and close the opt-out gap in the five marketing senders that currently bypass it.

**Architecture:** Campaign send becomes two halves. An *enqueue* half resolves the audience once and pushes one PGMQ message per recipient, then returns immediately. A *drain* half — a pg_cron-driven worker — pops messages at a configured interval, re-checks opt-out at send time, sends one message, and records it. Run state (`running`/`paused`/`cancelled`/`completed`) lives in a `campaign_runs` row the worker consults on every tick, which is what makes pause and cancel possible at all.

**Tech Stack:** Supabase Postgres + PGMQ + pg_cron, Deno edge functions, OpenPhone SMS API, React + TanStack Query front end.

---

## Global Constraints

**Ownership (from `CLAUDE.md`).** Lovable owns `supabase/`. A git push does not deploy an edge function or run a migration. Every task below that touches `supabase/` is written as a **paste-ready Lovable prompt**, not a local edit. Tasks marked *(Claude Code)* touch `src/` only and are committed normally.

**Do not start Phase 1 until Phase 0 returns.** The whole plan assumes `automated_campaigns` has no `scheduled_at`, that PGMQ is installed, and that `process-email-queue` is cron-driven. Those are read from code, not from the live database. A migration file existing is not proof it ran.

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

## Phase 0 — Preflight (blocking)

- [ ] **0.1** Run `docs/superpowers/specs/2026-07-28-campaign-queue-preflight.sql` in Lovable. Paste results back.
- [ ] **0.2** Confirm from results: (a) `automated_campaigns` has no `scheduled_at`; (b) PGMQ extension present and which queues exist; (c) `process-email-queue` cron `schedule` string — **the worker cadence in Phase 2 must match whatever granularity pg_cron is actually configured for here**; (d) `log_org_email_send_failure` exists.
- [ ] **0.3** If any assumption is wrong, stop and revise this plan before writing code.

**Note on cadence:** if pg_cron on this instance only supports minute granularity, a 30-second throttle cannot be achieved by cron frequency alone. In that case the worker sends *up to* `floor(60 / throttle_seconds)` messages per minute-tick, spacing them with an in-function delay — still well inside the wall-clock limit at these volumes. Decide this at 0.2, not later.

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
> Create the PGMQ queue: `select pgmq.create('campaign_sms');`
>
> Then deploy/run the migration and confirm it applied, not just committed.

- [ ] **1.2** Verify live: `campaign_runs` exists with the check constraints, `pgmq.list_queues()` shows `campaign_sms`, and `set_campaign_run_status` is `prosecdef = true`. Confirm a plain `authenticated` role cannot UPDATE `campaign_runs` directly.

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

- [ ] **2.3** Add the cron entry, matching the cadence decided in 0.2.

> **Lovable prompt:** Add a migration scheduling `process-campaign-queue` via `pg_cron`, following the exact pattern of the existing `process-email-queue` job (same invocation style, same auth header approach). Use the cadence we confirmed in preflight. Then run it and confirm the job appears in `cron.job` and is `active`.

- [ ] **2.4** Verify live with a **single-recipient** run inserted by hand: confirm one message sends, `sent_count` reaches 1, status lands on `completed`, and the message appears in `sms_messages`. Do not proceed on a real audience until this passes.

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

## Out of scope (deliberately)

Tracked, not included — each is independent and would dilute this plan:

- **Invoice email error surfacing.** `InvoicesPage.tsx:250` and `InvoiceViewDialog.tsx:87` collapse every failure into supabase-js's generic "Edge Function returned a non-2xx status code". The send path itself works. Separate, small.
- **Discounts under Campaigns.** Nav/IA change, cosmetic.
- **Splitting `CampaignsPage.tsx`.** 1,655 lines. This plan adds only to new files; the split deserves its own pass.

---

## Definition of done

1. A campaign with 50 recipients at 60s throttle takes ~50 minutes and never blocks the UI.
2. Pause stops sending within one cron tick; queued messages survive; resume continues from where it stopped.
3. A run paused for 24 hours flips to `cancelled` with `cancel_reason='expired'` and is visibly cancelled in the UI, not silently dropped.
4. A customer who texts `stop` mid-run receives no further messages from that run.
5. None of the five Phase 4 senders can message an opted-out customer.
6. Choosing "later" schedules; it does not send immediately.
7. Campaign sends appear in the Messages tab at send time, not on webhook echo.
8. `npx tsc --noEmit -p tsconfig.app.json` clean; QA suite green.
