# Refund History Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record refunds as dated events in their own table, restore the sale prices that were overwritten, and stop `bookings.total_amount` being mutated — so prior periods stop silently restating.

**Architecture:** A `booking_refunds` table holds one row per refund with its own `refunded_at`. `bookings.total_amount` returns to meaning "what the job sold for", permanently. Revenue becomes `total_amount − sum(refunds in period)`. `payment_status` stops carrying refund state entirely — refund status is derived from the table, which removes the `'partial'` ambiguity by deleting the overload rather than adding a fifth enum value.

**Tech Stack:** Postgres (Supabase, Lovable-managed) · Deno edge functions · Stripe API v2

**Background:** `docs/bugs/2026-07-30-partial-refunds-investigation.md`

## Global Constraints

- **Restore and history creation are one pass, per booking, atomically.** After the fact there is no way to tell which reductions are already reflected — a second pass would double-count every refund it re-derived.
- **Every reconstructed refund is marked as reconstructed.** Stripe-sourced and inferred refunds must be distinguishable forever, so nobody later treats an inference as a fact.
- **`total_amount` is never written by a refund again**, on any path.
- **`payment_status` reverts to meaning payment only** — `pending | partial | paid`. A refunded booking is `paid` plus a refund row, because that is what happened: they paid, then got money back.
- **Cleaners keep their pay on a refunded job.** Already the implemented policy (`PnLCalendar:170-172`); this plan must not change it.
- `supabase/` is Lovable's — every task ships as a paste-ready prompt ending in "confirm deployed, not just committed."

---

## Sizing first: the manual gap is smaller than I told you

I said manual refunds were unrecoverable. **That was too pessimistic, and the correction
changes whether the backfill is worth doing.**

`subtotal` is **never touched by the refund path** — verified, the only column the refund
writes besides `payment_status` is `total_amount`. So for a manually-refunded booking,
`subtotal` still holds the pre-discount sale price. Combined with `discount_amount`, the
original total is derivable:

```
original_total ≈ subtotal − COALESCE(discount_amount, 0)
inferred_refund = original_total − current total_amount
```

That is an inference, not a fact — but it is a well-founded one, and it converts most of
what I called unrecoverable into "recoverable, flagged as inferred".

So there are **three recovery tiers**, not two:

| Tier | Condition | Confidence |
|---|---|---|
| **A — authoritative** | `payment_intent_id` present | Stripe has the original charge and every refund with its real date |
| **B — inferred** | no payment intent, `subtotal > 0` | original from `subtotal − discount_amount`; **refund date unknown** |
| **C — lost** | no payment intent, no usable `subtotal` | reduction is visible, original is not |

Tier B's real limitation is not the amount — it is the **date**. An inferred refund has
no timestamp, which is the whole point of the exercise. Options are to date it
`updated_at` (approximate, and wrong if the row changed for another reason afterwards) or
leave it null and exclude it from period reporting. **That is a decision to take after
seeing the counts**, not now.

### Task 0: run this before anything else

- [ ] **Step 1: Size the three tiers**

```sql
select
  count(*)                                                          as refund_affected,
  count(*) filter (where payment_intent_id is not null)             as tier_a_stripe,
  count(*) filter (where payment_intent_id is null
                     and coalesce(subtotal,0) > 0)                  as tier_b_inferred,
  count(*) filter (where payment_intent_id is null
                     and coalesce(subtotal,0) = 0)                  as tier_c_lost,
  sum(case when payment_intent_id is null and coalesce(subtotal,0) > 0
           then (subtotal - coalesce(discount_amount,0)) - total_amount end)
                                                                    as tier_b_refund_total
from public.bookings
where payment_status in ('refunded','partial');
```

- [ ] **Step 2: Check the `'partial'` ambiguity in real data** — this decides how hard reclassification is

```sql
-- A partially-PAID booking should have no refund fingerprint. A partially-
-- REFUNDED one should show total_amount below its derived original.
select
  count(*)                                                              as partial_rows,
  count(*) filter (where coalesce(subtotal,0) > 0
                     and total_amount < (subtotal - coalesce(discount_amount,0)) - 0.005)
                                                                        as looks_refunded,
  count(*) filter (where coalesce(subtotal,0) > 0
                     and total_amount >= (subtotal - coalesce(discount_amount,0)) - 0.005)
                                                                        as looks_partially_paid,
  count(*) filter (where coalesce(subtotal,0) = 0)                      as undecidable
from public.bookings
where payment_status = 'partial';
```

- [ ] **Step 3: Size the payroll exposure** (from the investigation, repeated here so Task 0 is self-contained)

```sql
select count(*) as exposed_bookings
from public.bookings b
where b.cleaner_wage_type = 'percentage'
  and coalesce(b.cleaner_pay_expected, 0) = 0
  and coalesce(b.cleaner_actual_payment, 0) = 0
  and not exists (select 1 from public.booking_team_assignments t
                  where t.booking_id = b.id and coalesce(t.pay_share,0) > 0);
```

**Decision gate.** If `tier_c_lost` is a large share, or `undecidable` in Step 2 is high,
the backfill buys less than it costs and the honest move is to fix forward only — new
refunds recorded properly, history left as-is with a documented cut-off date. **Do not
start Task 2 until these numbers are in.**

---

## Task 1: Schema

- [ ] **Step 1: Create `booking_refunds`**

```sql
create table public.booking_refunds (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,

  amount_cents      bigint not null check (amount_cents > 0),
  currency          text   not null default 'usd',

  -- The whole point. A July refund of a June job belongs to July.
  refunded_at       timestamptz,          -- null ONLY for tier-B inferred rows
  method            text not null,        -- 'stripe' | 'manual' | 'manual_inferred'
  stripe_refund_id  text unique,          -- null for manual
  reason            text,
  created_by        uuid,

  -- How this row came to exist. 'live' = recorded by the app at refund time.
  -- Anything else was reconstructed and must never be mistaken for a fact.
  recovery_method   text not null default 'live',
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),

  constraint br_method_chk   check (method in ('stripe','manual','manual_inferred')),
  constraint br_recovery_chk check (recovery_method in ('live','stripe_backfill','subtotal_inferred')),
  -- An inferred row is the only kind allowed to have no date.
  constraint br_date_chk     check (refunded_at is not null or recovery_method = 'subtotal_inferred')
);

create index idx_booking_refunds_booking on public.booking_refunds(booking_id);
create index idx_booking_refunds_org_date on public.booking_refunds(organization_id, refunded_at desc);
```

- [ ] **Step 2: Add the original-price column**

```sql
alter table public.bookings
  add column if not exists original_total_amount numeric(10,2);
```

Deliberately a **new column** rather than restoring `total_amount` in place. Restoring in
place would make the migration irreversible and unverifiable — with both columns present
you can diff them, confirm the reconstruction looks sane, and only then switch the
readers over. `total_amount` becomes correct at the end of Task 2, not the start.

- [ ] **Step 3: Verify live** — column list, both FK definitions (`booking_id` cascades
      deliberately; a deleted booking has no refunds, but `organization_id` must be
      `SET NULL` so org deletion cannot erase financial history), and that the view of
      an empty table returns zero rows.

## Task 2: The one pass

**This is the task the whole plan exists to get right.** Restore, reconstruct and
reclassify happen together, per booking, in one transaction. Splitting them is the
failure mode: after `total_amount` is restored, the reduction that revealed the refund is
gone, and a second pass has nothing to infer from.

- [ ] **Step 1: Tier A — Stripe-authoritative.** For every booking with a
      `payment_intent_id` and `payment_status in ('refunded','partial')`: fetch the
      payment intent and its refunds. Per booking, in one transaction:
      - `original_total_amount := payment_intent.amount / 100`
      - insert one `booking_refunds` row per Stripe refund — real `amount`, real
        `created` as `refunded_at`, `stripe_refund_id`, `method='stripe'`,
        `recovery_method='stripe_backfill'`
      - `total_amount := original_total_amount`
      - `payment_status := 'paid'`

- [ ] **Step 2: Tier B — inferred.** No payment intent, `subtotal > 0`. Same transaction
      shape, but:
      - `original_total_amount := subtotal − COALESCE(discount_amount,0)`
      - **one** synthetic refund row for the difference, `method='manual_inferred'`,
        `recovery_method='subtotal_inferred'`, `refunded_at` per the Task 0 decision
      - skip entirely if the difference is ≤ 0 — that is a partially-**paid** booking, not
        a refund, and Task 0 Step 2 counted them

- [ ] **Step 3: Tier C — leave alone, and record that you did.** No refund row, no
      restore. Write the booking ids to a doc or an audit table so the gap is a known,
      named set rather than an absence. **These bookings keep `payment_status` as-is** —
      reclassifying them to `paid` would assert a refund happened without evidence.

- [ ] **Step 4: Idempotency.** Re-running must be a no-op. Guard on
      `original_total_amount is not null` — a booking already processed is skipped
      entirely. Prove it by running twice and diffing `count(*)` on `booking_refunds`.

- [ ] **Step 5: Reconcile before trusting.** Per org, compare the sum of Tier A refunds
      against Stripe's own totals for the period. A mismatch means the join or the
      pagination is wrong, and it is far cheaper to find here than after the readers
      switch over.

## Task 3: Stop the mutation

- [ ] **Step 1:** `BookingsPage.tsx` — both refund paths (`:634-656` manual and
      `:684-687` Stripe) stop writing `total_amount` and stop writing refund state into
      `payment_status`. They insert a `booking_refunds` row instead, with
      `recovery_method='live'` and the real refund date.
- [ ] **Step 2:** `process-refund` returns the Stripe refund's `created` timestamp so the
      row carries Stripe's date rather than the browser's clock.
- [ ] **Step 3:** Manual refunds get `method='manual'` and `refunded_at = now()` — a
      manual refund is at least *observed* live, unlike the inferred backfill rows.

## Task 4: Make the readers honest

**These must ship together with Task 2, or reporting double-counts** — restored
`total_amount` values with readers that still assume the figure is net would overstate
revenue by exactly the refunded amount. This is the riskiest moment in the plan.

- [ ] **Step 1:** `ReportsPage`, `FinancePage`, `PnLOverview` — revenue becomes
      `total_amount − sum(booking_refunds in the reporting period)`, joined on
      `refunded_at`, not on the booking's date. **This is what stops June changing.**
- [ ] **Step 2:** `PnLCalendar:152-176` — `isRefunded` becomes a `booking_refunds`
      lookup rather than `payment_status === 'refunded'`, and the filter at `:153` stops
      treating `'partial'` as refund-related. Keep its existing behaviour otherwise: the
      Stripe fee is computed on the **original** charge and **cleaners keep their pay**.
      That comment block is correct and should survive intact.
- [ ] **Step 3:** `FinancePage:244` — the `total_amount === 0 → 'Re-clean'` label stops
      misfiring once totals are restored, but it is a fragile test regardless. Replace
      it with something that actually means re-clean.
- [ ] **Step 4:** Anywhere reading `payment_status` for refund state switches to the
      table. Grep for `'refunded'` across `src/` before declaring this done.

---

## The `'partial'` ambiguity — fixed by deletion, not addition

You asked for this in the same change. The fix is to stop `payment_status` carrying
refund state at all, rather than adding a `partially_refunded` enum value.

**Why not a fifth enum value:** it keeps two unrelated concepts in one column, needs
maintaining forever, cannot be removed once added (`ALTER TYPE … ADD VALUE` is one-way),
and still cannot express "partially paid *and* partially refunded" — which is a real
state a deposit-then-refund booking can reach.

**After this plan:**

| Question | Answered by |
|---|---|
| Have they paid? | `payment_status` — `pending \| partial \| paid` |
| Was any refunded? | `exists (select 1 from booking_refunds where booking_id = …)` |
| Fully or partially? | `sum(amount_cents) >= original_total_amount * 100` |
| When? | `refunded_at` |

Derived, so it cannot drift out of sync with the refunds themselves.

**The reclassification is part of Task 2's transaction** — a booking that gets refund rows
also gets `payment_status := 'paid'` in the same statement. Tier C keeps its existing
status, since there is no evidence to justify rewriting it.

---

## Self-review

- **Your two explicit requirements:** the one-pass rule is Task 2's defining constraint,
  stated in Global Constraints and repeated in the task, with idempotency (Step 4) and
  reconciliation (Step 5) as its guards. The `'partial'` ambiguity is resolved inside the
  same transaction, by removing the overload rather than extending the enum.
- **Sizing is Task 0 and gates everything**, with an explicit decision gate saying not to
  start Task 2 until the numbers are in — and a stated fallback (fix forward only, with a
  documented cut-off) if the recoverable share is poor.
- **I corrected myself on the manual gap.** `subtotal` survives the refund path, so most
  manual refunds are inferrable. The residual limitation is the *date*, not the amount,
  which is worth knowing because the date is the entire point of the table.
- **Known risk, stated not hidden:** Tasks 2 and 4 must ship together. Between restoring
  `total_amount` and updating the readers, every revenue figure overstates by the
  refunded amount. If they cannot ship together, Task 4 should go first with readers
  written to handle both shapes.
- **Not designed, deliberately:** the UI. And the `refunded_at` choice for tier B, which
  needs Task 0's counts to decide sensibly.
