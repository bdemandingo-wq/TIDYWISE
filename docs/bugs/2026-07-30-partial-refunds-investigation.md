# Partial refunds — what's recorded, what reports say, what it'd take to be honest

**Investigated:** 2026-07-30. Read-only, nothing changed.

**Your premise needs correcting in a way that matters.** You can record a partial
refund today — there is an amount field and both paths accept it. The problem is not
that nothing is written. **It is that the refund is recorded by destructively editing
the original price**, so the sale price is overwritten and the refund itself is never
stored as a fact.

Consequence for your main worry: **reports are not overstating revenue.** They are
doing something else — silently restating closed periods.

---

## 1. What actually happens when you refund

Both full and partial are supported, through **two** paths in
`BookingsPage.tsx:610-700`.

**Path A — Stripe refund** (booking has a `paymentIntentId`):
`process-refund` accepts `refundType: "full" | "partial"` and `amount` (dollars),
validates the amount against the payment intent, calls `stripe.refunds.create`, and
**writes nothing to the database** — its only "log" is `logAudit`, which is
`console.log` (see `_shared/audit-log.ts:2`). It returns `{refundId, amount, isFullRefund}`.

**Path B — manual refund** (`:634-656`, no payment intent): no Stripe call at all. It
just records locally, and the toast says so — *"No Stripe refund was processed — refund
the customer manually if needed."*

**Both paths then do the same local write** (`:684-687` and `:643-647`):

```ts
const nextTotalAmount = data.isFullRefund
  ? 0
  : Math.max(0, (booking.total_amount || 0) - refundedAmount);

await updateBooking.mutateAsync({
  id: booking.id,
  payment_status: (data.isFullRefund ? 'refunded' : 'partial'),
  total_amount: nextTotalAmount,      // ← the original price is overwritten
});
```

So what is recorded is: `payment_status`, and a **reduced `total_amount`**. What is
*not* recorded, anywhere: the refund amount, the refund date, the Stripe refund id, the
reason, who authorised it, or **what the job originally sold for**.

There is no `refunds` table and no refund column on `bookings` — confirmed against the
generated types (`discount_amount`, `original_scheduled_at`, `pay_base_amount`,
`subtotal`, `tax_amount`, `total_amount`, and nothing else money-shaped).

### Four consequences of recording it this way

1. **The sale price is destroyed.** A $300 job refunded $50 is indistinguishable from a
   job that was always $250. You cannot answer "what did we charge?" after the fact.
2. **Repeat partials arithmetically work, historically do not.** $300 → refund $50 →
   $250 → refund $30 → $220. The running number is right; the history is gone. You
   cannot tell one $80 refund from two.
3. **`payment_status = 'partial'` is ambiguous.** The enum is
   `('pending','partial','paid','refunded')` and `partial` originally meant *partially
   paid*. It is now also written for *partially refunded*. Those are opposite
   situations — one is money owed to you, the other money owed back — and they are
   indistinguishable in the column.
4. **A fully-refunded booking gets mislabelled.** `FinancePage.tsx:244`:
   `service_name: b.service?.name || (b.total_amount === 0 ? 'Re-clean' : 'Service')`.
   A full refund sets `total_amount = 0`, so any refunded booking with no linked
   service now displays as **"Re-clean"** in Finance.

## 2. What your reporting currently says

Checked `ReportsPage`, `FinancePage`, `PnLCalendar`, `PnLOverview`. **Every revenue
figure reads `bookings.total_amount`, and none of them filters on `payment_status`**
(except `PnLCalendar`, below).

So refunded money **does not** count as revenue — but only because the source number was
already reduced. Right answer, wrong mechanism, and the mechanism has a sting:

> **`scheduled_at` does not change when you refund. `total_amount` does.**

Refund a June job in July, and **June's revenue drops**. Last month's reported figures
change after the fact, with no record of why. If you reconcile to Stripe, export monthly
figures, or have already filed on them, they will no longer agree — and nothing in the
app explains the difference.

That is the honest answer to your worry: not "you are looking at money you gave back",
but "**you cannot trust a number you looked at last month to still say the same thing**".

**`PnLCalendar` is the exception, and it is thoughtful.** `:152-176` deliberately keeps
refunded jobs visible:

```ts
const isRefunded = b.payment_status === 'refunded';
const charged = Number(b.total_amount) || 0;
const gross   = isRefunded ? 0 : charged;
const fee     = (charged * 0.029) + 0.30;
```

with a comment explaining that a refunded job still cost you the cleaner's pay and
Stripe's fee, so the day should show the loss. Someone thought about this properly.

**But it only handles the full-refund case.** For a partial, `payment_status` is
`'partial'`, so `isRefunded` is false and `gross = charged` — the already-reduced
figure. The Stripe fee is then computed on the reduced amount too, understating it,
because Stripe charged its fee on the **original**. And because `'partial'` is in the
include-list at `:153` as a *payment* status, partially-paid and partially-refunded
bookings flow through the same branch.

## 3. Can Stripe reconstruct it? Yes, fully

Established in `docs/investigations/2026-07-30-self-owned-stripe-revenue-data.md`:
`refunds.list` and `charges.list` have **no retention limit**. Every refund carries
`id`, `amount`, `currency`, `created`, `reason`, `status`, `charge` and
`payment_intent`; every charge carries `amount_refunded` and `refunded`.

And `process-refund:96-105` sets metadata on each refund — including `refund_type` —
so the Stripe-path refunds are self-describing on retrieval.

**So Path A is fully reconstructible**: every Stripe refund ever issued, with amount and
date, joinable back to a booking via `payment_intent`.

**Path B is partly recoverable — I was too pessimistic here.** Corrected while planning
the fix: the refund path writes only `payment_status` and `total_amount`. **`subtotal` is
never touched.** So for a manually-refunded booking the pre-discount sale price survives,
and the original total is derivable as `subtotal − COALESCE(discount_amount, 0)`, with
the refund as the difference from the current `total_amount`.

That is an inference rather than a fact, and its real limitation is the **date** — an
inferred refund has no timestamp, which is the whole point of recording refunds
separately. But it converts most of what I called unrecoverable into "recoverable,
flagged as inferred". Only bookings with no payment intent *and* no usable `subtotal` are
genuinely lost. Sizing query in
`docs/superpowers/plans/2026-07-30-refund-history-repair.md`, Task 0.

**The original sale price is also partly recoverable** — `payment_intent.amount` is what
was actually charged, so for Stripe-paid bookings you can restore the pre-refund total
even though the column was overwritten.

## 4. Column or table? Table — and for a second reason too

**A table.** Two independent arguments:

1. **Repeat partials.** A booking can be refunded more than once. A single
   `refunded_amount` column holds a running total and loses the individual events —
   which is the situation you already have, just named better.
2. **A refund is an event with its own date.** This is the one that actually fixes §2.
   Storing `refunded_at` separately from `scheduled_at` is what lets a July refund of a
   June job stop rewriting June. A column on `bookings` cannot express that, because
   the booking has only one date.

Shape (not a design, just what the facts demand):

```
booking_refunds
  id, booking_id, organization_id (SET NULL, not CASCADE),
  amount_cents, currency,
  refunded_at,            -- Stripe's timestamp, NOT now()
  method,                 -- 'stripe' | 'manual'
  stripe_refund_id,       -- null for manual
  reason, created_by,
  raw jsonb
```

**And `bookings.total_amount` should stop being mutated.** Restore it to the sale price
and let revenue be computed as `total_amount − sum(refunds)`. That is what makes the
sale price recoverable, makes repeat partials expressible, and makes period figures
stable.

**Migration has an ordering trap worth stating now:** you cannot restore original prices
*after* you start writing refund rows, because you would not know which reductions are
already reflected. The Stripe backfill has to establish original amounts and refund
history in the same pass, before any new refund is recorded through the new path.

## 5. What breaks — payroll is mostly safe, and I can say why

**Short answer: cleaners keep their pay, in almost every case, and that is deliberate.**

`wageCalculation.ts:16-27` documents the payout priority, which mirrors
`payroll-period-process.ts:calcWage` exactly:

```
1. booking_team_assignments.pay_share   (per-cleaner)
2. booking.cleaner_pay_expected         (booking-level SNAPSHOT)
3. booking.cleaner_actual_payment       (legacy override)
4. computed from wage type / rate / hours
```

Levels 1–3 are **stored values**, unaffected by `total_amount` changing. And the file
notes explicitly that `staff.percentage_rate` is **not read** — "the payout engine
selects that column but never uses it in its wage math".

`PnLCalendar` already encodes the business answer too: *"cleaners keep their pay on a
refunded job"*, with fees and pay both computed off `charged` rather than gross.

**The one exposure:** level 4 computes from `cleaner_wage_type` / `cleaner_wage`, and
`getNetRevenue()` (`:103-111`) derives that from `subtotal` / `total_amount`. So a
booking with **no** pay snapshot **and** a percentage-type booking-level wage would
recompute its cleaner pay downward when `total_amount` drops. Whether any such bookings
exist is a data question, not a code one — query below.

**So the question you wanted flagged is real but narrow.** The policy ("cleaners keep
their pay") is already implemented and commented. The risk is that a refund silently
changes pay for one specific booking shape, and nobody would see it because payroll
recomputes rather than warning.

### What to check before changing anything

```sql
-- 1. How many bookings could have their pay recomputed by a refund?
select count(*) as exposed_bookings
from public.bookings b
where b.cleaner_wage_type = 'percentage'
  and coalesce(b.cleaner_pay_expected, 0) = 0
  and coalesce(b.cleaner_actual_payment, 0) = 0
  and not exists (
    select 1 from public.booking_team_assignments t
    where t.booking_id = b.id and coalesce(t.pay_share, 0) > 0
  );

-- 2. How much has been refunded that reporting has already absorbed?
select payment_status, count(*),
       sum(total_amount) as remaining_total,
       count(*) filter (where total_amount = 0) as fully_zeroed
from public.bookings
where payment_status in ('refunded', 'partial')
group by payment_status;

-- 3. The ambiguity in numbers: how many 'partial' rows are partially PAID
--    versus partially REFUNDED? If this returns a mix, the column cannot be
--    disambiguated locally and only Stripe can separate them.
select b.id, b.booking_number, b.total_amount, b.payment_status, b.scheduled_at
from public.bookings b
where b.payment_status = 'partial'
order by b.scheduled_at desc
limit 50;

-- 4. Refunded bookings mislabelled as re-cleans in Finance
select count(*) from public.bookings
where total_amount = 0 and payment_status = 'refunded' and service_id is null;
```

Query 3 is the one that decides how hard the backfill is. If every `'partial'` row turns
out to be a refund, the local data is interpretable. If it is genuinely mixed, only
Stripe can tell the two apart — and only for the Stripe-paid ones.

---

## Summary

| Question | Answer |
|---|---|
| Can you record a partial refund? | **Yes** — both paths accept an amount. The amount is just never stored. |
| What is written? | `payment_status`, and `total_amount` overwritten with the reduced figure |
| Is refunded money counted as revenue? | **No** — but only because the source was mutated |
| So what is wrong with reports? | **Prior periods silently restate.** A July refund changes June. |
| Can Stripe reconstruct it? | **Path A fully.** Path B is inferrable from the untouched `subtotal` — amount yes, date no. Only no-intent-and-no-subtotal is lost |
| Column or table? | **Table** — repeat partials, and a refund needs its own date |
| Does payroll break? | **No, by design** — snapshots and hourly rates. One narrow exposure, query 1 sizes it |
