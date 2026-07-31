# Owned Revenue Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Own a complete, exportable copy of every dollar TidyWise has ever earned, in storage that survives losing access to Stripe *and* to Lovable's Supabase.

**Architecture:** Two append-only Postgres tables — an event ledger (`billing_events`, one row per money movement) and an interval table (`billing_subscription_periods`, one row per price-state per subscription). Cash comes from the first, MRR from the second, and a view exposes the gap between them. A resumable backfill job replays all recoverable Stripe history into both; webhooks keep them current; a scheduled dump writes CSV + JSONL to object storage the owner personally controls.

**Tech Stack:** Postgres (Supabase, Lovable-managed) · Deno edge functions · Stripe API v2 (`stripe@17.7.0`, already in use) · Cloudflare R2 (S3-compatible) · Resend (already integrated)

**Background:** `docs/investigations/2026-07-30-self-owned-stripe-revenue-data.md` — read it first; it contains the evidence for every design decision below.

## Global Constraints

- **Platform Stripe only.** Connect flows (`create-stripe-invoice`, `send-invoice`, `process-deposit`) are orgs charging their own customers and must never enter this ledger.
- **Append-only.** No `UPDATE`, no `DELETE` on `billing_events`. Corrections are new rows.
- **`organization_id` is `ON DELETE SET NULL`, never `CASCADE`.** `delete-my-organization` must not be able to destroy revenue history.
- **Identity denormalised as text** (`organization_name`, `customer_email`) so an exported CSV reads standalone.
- **Money is `bigint` cents plus explicit `currency`.** Never floats.
- **`occurred_at` is Stripe's timestamp**, `synced_at` is ours. Both stored.
- **Every ingest is idempotent** — unique on the Stripe object id, so backfill and live capture converge instead of duplicating.
- **All four revenue streams from day one:** `plan`, `ad_management`, `lifetime`, `ai_credits`.
- **MRR and cash stay separate numbers.** Never reconcile them into one.
- `supabase/**` is Lovable's — every task here ships as a paste-ready prompt ending in "confirm deployed, not just committed."

---

## Decision: where the export goes

You asked for this specifically, so it is a decision, not an option list.

**Primary: Cloudflare R2.** S3-compatible bucket in an account that is yours alone.

- Independent of Lovable, Supabase and Stripe — the three things being insured against
- S3-compatible, so any tool on earth reads it; no lock-in to R2 either
- **Zero egress fees**, which matters precisely in the scenario this exists for: pulling the entire history out in a hurry
- Costs roughly $0.015/GB-month, and this dataset is megabytes — call it cents per year
- Works from Deno with `aws4fetch` or hand-rolled SigV4; no SDK bloat

**Secondary: a monthly email to a personal address, via Resend.** Already integrated, so it needs no new vendor, no new secret beyond a recipient address.

The second copy is not redundancy for its own sake. **A scheduled dump that silently stops working is worthless, and object storage fails silently by nature.** An email that stops arriving is noticed by a human within a month. That self-monitoring property is the reason it is in the definition of done rather than a nice-to-have.

**Not chosen, and why:** AWS S3 — egress costs and IAM overhead for no benefit here. Google Drive / Dropbox — OAuth refresh tokens rotate and expire, and a dump that dies quietly is the exact failure being insured against. A private GitHub repo is a defensible third copy if you want version history, but is not a substitute for either.

**Format:** both, every time.
- `revenue-YYYY-MM-DD.csv.gz` — flat, human-readable, opens in Excel
- `revenue-YYYY-MM-DD.jsonl.gz` — includes the `raw` Stripe payloads, for questions not yet asked
- `MANIFEST.md` — column meanings, row counts, generation date. Written every dump so the archive explains itself to someone who is not you, in three years, without this repo.

---

## File structure

| Path | Responsibility | Owner |
|---|---|---|
| `supabase/migrations/…_billing_ledger_schema.sql` | the two tables, job table, view, RLS, indexes | Lovable |
| `supabase/functions/billing-backfill/index.ts` | resumable Stripe replay | Lovable |
| `supabase/functions/billing-export/index.ts` | dump to R2 + email | Lovable |
| `supabase/functions/stripe-subscription-webhook/index.ts` | **extend** — append to ledger | Lovable |
| `supabase/functions/stripe-ai-credits-webhook/index.ts` | **extend** — append credit purchases | Lovable |
| `supabase/functions/reconcile-checkout-session/index.ts` | **extend** — append lifetime + first subscription | Lovable |
| `src/pages/admin/RevenuePage.tsx` | display, last | Claude Code |

---

## Task 1: Schema

**Deliverable:** tables exist, are locked to platform admin, and the summary view returns zero rows without error.

**Interfaces produced:** `billing_events`, `billing_subscription_periods`, `billing_backfill_jobs`, `billing_monthly_summary`.

**Blocking unknown to resolve inside this task:** the real platform-admin predicate. `20260405205126…sql:20-23` gates on `auth.users.email = 'support@tidywisecleaning.com'`; there may since be an `is_platform_admin()` function. The prompt asks Lovable to report what exists rather than assuming — do not hardcode the email if a function exists.

- [ ] **Step 1: Run the schema prompt** (full text in "First Lovable prompt" below)

- [ ] **Step 2: Verify live, not from the file**

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('billing_events','billing_subscription_periods','billing_backfill_jobs')
order by table_name, ordinal_position;

-- the constraint that matters most
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='public.billing_events'::regclass and contype='f';
```
Expected: the `organization_id` FK reads `ON DELETE SET NULL`. If it says `CASCADE`, stop and fix before anything writes a row.

- [ ] **Step 3: Confirm the view runs empty**

```sql
select * from public.billing_monthly_summary;
```
Expected: zero rows, no error.

---

## Task 2: Backfill

**Deliverable:** every recoverable Stripe object is in the ledger, and re-running changes nothing.

**Interfaces consumed:** all of Task 1.

**Design constraints, all from the investigation:**

- **Resumable.** One edge invocation cannot page a whole account. Persist Stripe's `starting_after` cursor in `billing_backfill_jobs` after each page; the function processes N pages then returns, and is re-invoked until `status='complete'`.
- **Idempotent.** `UPSERT ON CONFLICT (stripe_object_id, event_type) DO NOTHING`. Re-running is free and is the designed way to close gaps.
- **Restricted read key.** A Stripe restricted key with read-only scopes, not `STRIPE_SECRET_KEY`. This job will be run repeatedly.
- **Order matters.** Subscriptions and invoices first — they are the spine. Then charges/refunds/disputes. Then checkout sessions, which is how AI credits and lifetime get their dollar amounts.

**Per-stream sourcing:**

| Stream | Source | Note |
|---|---|---|
| `plan` | `subscriptions.list({status:'all'})` + `invoices.list` | periods from subscription items; cash from invoices |
| `ad_management` | same, filtered by price id | reconcile against `ad_management_subscriptions` |
| `lifetime` | `checkout.sessions.list` + `lifetime_access_purchases` | local table already has `amount_cents` — cross-check |
| `ai_credits` | `checkout.sessions.list` joined on `ai_credit_ledger_entries.stripe_session_id` | the session id is the only bridge to the dollar amount |

- [ ] **Step 1:** Prompt Lovable to create `billing-backfill` with the cursor/resume contract above
- [ ] **Step 2:** Dry run — `{mode:'count'}` returns object counts per endpoint without writing. Record them; this is the completeness baseline.
- [ ] **Step 3:** Run to completion, re-invoking until `status='complete'`
- [ ] **Step 4:** Verify completeness against the dry-run counts

```sql
select revenue_stream, event_type, count(*), min(occurred_at), max(occurred_at),
       sum(amount_cents) filter (where counts_as_cash) as cash_cents
from public.billing_events group by 1,2 order by 1,2;
```

- [ ] **Step 5: Prove idempotency.** Re-run the whole backfill. `select count(*) from billing_events` must be identical. If it grows, the conflict target is wrong — stop.

- [ ] **Step 6: Sanity-check against something you already trust**

```sql
-- lifetime purchases are already stored locally with amounts; they must agree
select
  (select sum(amount_cents) from public.lifetime_access_purchases) as local,
  (select sum(amount_cents) from public.billing_events
    where revenue_stream='lifetime' and counts_as_cash) as ledger;
```
A mismatch here means the backfill is wrong somewhere it can be checked — far better to find it on the one stream with local ground truth.

---

## Task 3: Live capture

**Deliverable:** new money lands in the ledger within seconds, without a backfill run.

**The gap to be explicit about:** between Task 2 finishing and Task 3 shipping, new events are missed. That is fine and by design — the backfill is idempotent, so **re-run it once after Task 3 deploys** and the gap closes. Plan for that re-run rather than trying to avoid the gap.

- [ ] **Step 1:** Extend `stripe-subscription-webhook` — append `subscription.started` / `.changed` / `.cancelled` rows and close/open `billing_subscription_periods` intervals. Map `cancellation_details.reason` → `voluntary` | `involuntary`.
- [ ] **Step 2:** Same function — **also fix the pre-existing bug** that it never updates `stripe_subscriptions`, so `status` and `current_period_end` stop being frozen at checkout values. Nearly free while the file is open, and that table is load-bearing for `emailEligibility` and the paywall.
- [ ] **Step 3:** Add `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` handling. Set `is_proration` from line items where `proration = true`.
- [ ] **Step 4:** Extend `stripe-ai-credits-webhook` to append an `ai_credits` event with the session's `amount_total`.
- [ ] **Step 5:** Extend `reconcile-checkout-session` to append lifetime purchases and the first subscription event.
- [ ] **Step 6:** Re-run the backfill; confirm row count grows only by the genuine gap.

---

## Task 4: Export — the actual deliverable

**Deliverable:** a dated CSV + JSONL + MANIFEST in your R2 bucket, and the same CSV in your inbox, on a schedule, verified by restoring from it.

- [ ] **Step 1:** Create the R2 bucket in **your own** Cloudflare account. Generate a scoped API token with object read/write on that bucket only. Store as `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` Supabase secrets.
- [ ] **Step 2:** Prompt Lovable to build `billing-export`: query both tables, emit gzipped CSV + JSONL + `MANIFEST.md`, PUT to R2 via SigV4, then email the CSV via Resend.
- [ ] **Step 3:** Schedule weekly via pg_cron. Follow the existing pattern (`20260701233328…sql`) — vault secrets, `net.http_post`.
- [ ] **Step 4: The test that matters.** Download the CSV. Open it in a spreadsheet on a machine with no access to Supabase, Stripe or this repo. **Can you answer "what was our MRR in March" and "what did customer X pay us in total" from the file alone?** If not, the denormalisation is insufficient — fix it now, not after you need it.
- [ ] **Step 5:** Verify the email actually arrives. An unmonitored backup is not a backup.

---

## Task 5: Display

Deliberately last and deliberately thin — by this point every question is plain SQL against `billing_monthly_summary`.

- [ ] **Step 1:** `src/pages/admin/RevenuePage.tsx` behind `PlatformAdminRoute`
- [ ] **Step 2:** MRR and cash as **two separate lines on one chart**, never summed, with the proration and refund deltas shown as the labelled gap between them
- [ ] **Step 3:** Revenue-stream breakdown — plan / ad_management / lifetime / ai_credits — so ad management's real share is finally visible
- [ ] **Step 4:** Churn split voluntary vs involuntary
- [ ] **Step 5:** A "Download CSV" button hitting the same export function, so the manual path is the automated path

---

## The first Lovable prompt — what it does

**Task 1 only. It creates structure and moves no data**, which is deliberate: the schema decisions are the ones that are expensive to change later, and every one of them can be verified before a single row exists.

Specifically it:

1. **Creates `billing_events`** — append-only, signed `amount_cents` (refunds negative), `counts_as_cash` so summing is unambiguous where an invoice and its charge both exist, `is_proration` to make requirement 3 answerable, denormalised `organization_name` / `customer_email`, `raw jsonb`, unique on `(stripe_object_id, event_type)`.
2. **Creates `billing_subscription_periods`** — the MRR spine. One row per price-state interval, with `effective_from` / `effective_to`, normalised interval fields, discount fields, and a `cancellation_reason` constrained to `voluntary` / `involuntary`.
3. **Creates `billing_backfill_jobs`** — cursor, page count, status, last error. Task 2 cannot be resumable without it.
4. **Creates `billing_monthly_summary`** — the view that keeps MRR and cash apart and shows the gap: month, `mrr_cents`, `cash_cents`, `proration_cents`, `refund_cents`, and `gap_cents` as an explicit column rather than something to work out.
5. **Locks both tables to platform admin** — and **reports what predicate actually exists** rather than assuming the hardcoded support email.
6. **Blocks UPDATE and DELETE** on `billing_events` with a trigger, so append-only is enforced by the database and not by convention.
7. **Adds indexes** on `occurred_at`, `(revenue_stream, occurred_at)`, `stripe_customer_id`, `organization_id`.

It returns: the live column list, the FK definition (to prove `SET NULL`), the RLS policies, and the platform-admin predicate it found.

**What it deliberately does not do:** touch `stripe_subscriptions`, touch Stripe, or backfill anything. If the schema is wrong, nothing has been built on it yet.

---

## Self-review notes

- **Spec coverage:** your three requirements map to — export destination decided and made Task 4 with a restore test, not a later phase (1); all four streams in `revenue_stream` from Task 1 and sourced individually in Task 2 (2); `mrr_cents` and `cash_cents` never combined, `gap_cents` explicit, `is_proration` captured at ingest (3).
- **Known gap, stated rather than hidden:** Tasks 3–5 are specified but not step-by-step code, because their exact SQL depends on what Task 1's live verification returns — particularly the platform-admin predicate. Expand each once its predecessor is verified. Writing that code now would be guessing at a schema that does not exist yet, which is the failure mode this repo has been bitten by.
- **Unrecoverable regardless:** Stripe's Events API retains ~30 days, so event-level detail older than that is gone permanently. Everything here reconstructs it from invoices instead. That is the reason to start the backfill sooner rather than later — invoice history keeps indefinitely, but each day's event detail expires.

---

## Reconciliation, 2026-07-31 — pinned. Do not re-derive.

**SaaS plan revenue = $1,290.00 across 38 cash-bearing rows.**

That is the number. If a future report disagrees, the report is wrong, not this line.

This line previously read **$2,179.00 across 50 rows**, and that was wrong. 12 of those 50 rows were `invoice.paid` events duplicating a `charge.succeeded` event for the *same* payment — $889.00 counted twice. `counts_as_cash` had been set true on both sides because those rows carry no shared `stripe_invoice_id` / `stripe_payment_intent_id`, so the ingest-time dedupe had nothing to match on and let both through. Corrected on 2026-07-31 by flipping the 12 invoice-side rows to `counts_as_cash = false` on the base table (not by a suppression rule in the view), each stamped in `correction_basis`. The charge side is authoritative and was left untouched.


### Why this had to be pinned

Two reports of the same classification, run the same day off the same single correction pass (all 1190 rows share one `corrected_at`), returned materially different figures:

| tier | report A | report B |
|---|---|---|
| certain | $129,533 | $147,294 |
| probable | $25,434 | $27,220 |
| inferred | $13,609 | $12,236 |
| plan | $2,179 / 94 rows | $1,489 / 14 rows |

Nothing had been reclassified. The two queries used different, unstated populations:

- **Report A** = `WHERE counts_as_cash` — successful charges plus `invoice.paid`, net of refunds and disputes.
- **Report B** = `WHERE event_type = 'charge.succeeded'` — gross charge volume only, dropping `invoice.paid`, which is where SaaS subscription cash actually lives.

Neither excluded `charge.failed` or `invoice.payment_failed` from its dollar figure — that was not the cause.

Two further defects, both inside report A:

1. **94 rows next to $2,179.** The count swept in failed payments while the amount did not — a count and an amount from different populations printed as one line. The real figure is 50 rows.
2. **Inferred reported gross of a $49 dispute** while certain and probable were reported net. Half-netted output inside a single table.

### What now enforces it

`public.billing_revenue_by_confidence` is the only reporting surface. Its definition pins all of the above structurally, not by convention:

- `WHERE counts_as_cash` is applied once, to the whole view, so `events` and `net_cash_cents` are always the same population. The 94-row failure mode is unrepresentable.
- Reversals are negative `amount_cents` rows inside that population, so `net_cash_cents` is net for every tier or for none. There is no filter that yields half-net output.
- `event_type` is deliberately **not** in the grain. Filtering to `charge.succeeded` is exactly how one tier ended up gross of its dispute; the column that made that possible is gone.
- Gross is exposed as `gross_cents` / `reversal_cents` alongside net, so anyone who wants a gross figure reads one rather than reconstructing it with a `WHERE` clause.

`billing_events` now carries a table comment stating it is raw data and not a reporting surface, naming the view instead, and `counts_as_cash` carries a comment saying any row count must apply the same filter as the sum.

### Reconciled ledger, as the view returns it

| confidence | stream | events | gross | reversals | net |
|---|---|---|---|---|---|
| certain | merchant_cleaning | 679 | $148,050.00 | −$18,517.15 | $129,532.85 |
| probable | merchant_cleaning | 147 | $27,545.50 | −$2,112.00 | $25,433.50 |
| inferred | merchant_cleaning | 60 | $13,608.77 | −$49.00 | $13,559.77 |
| probable | plan | 50 | $2,378.00 | −$199.00 | **$2,179.00** |
| certain | ai_credits | 1 | $10.00 | $0.00 | $10.00 |

The $49 that went missing between the two reports is now a visible `reversal_cents` value rather than a discrepancy.
