# Platform Revenue Page — Plan (Task 5)

**Goal:** One platform-admin view of the whole business, reading `billing_revenue_by_confidence` and nothing else, that can never look fresher than it is.

**Scope:** Frontend only. `src/pages/admin/PlatformRevenuePage.tsx` behind `PlatformAdminRoute`.

**Read before building:** the view's own `COMMENT`, which is unusually prescriptive and is treated here as a specification rather than documentation.

---

## What the view is, exactly

```sql
CREATE VIEW public.billing_revenue_by_confidence WITH (security_invoker = true) AS
SELECT date_trunc('month', occurred_at)::date              AS month,
       COALESCE(revenue_stream_corrected, revenue_stream)  AS stream,
       COALESCE(correction_confidence, 'certain')          AS confidence,
       count(*)                                            AS events,
       count(*) FILTER (WHERE amount_cents >= 0)           AS payment_events,
       count(*) FILTER (WHERE amount_cents <  0)           AS reversal_events,
       COALESCE(sum(amount_cents) FILTER (WHERE amount_cents >= 0), 0) AS gross_cents,
       COALESCE(sum(amount_cents) FILTER (WHERE amount_cents <  0), 0) AS reversal_cents,
       COALESCE(sum(amount_cents), 0)                      AS net_cash_cents
FROM public.billing_events WHERE counts_as_cash
GROUP BY 1, 2, 3;
```

**Grain: (month, stream, confidence).** Nine columns, all aggregate.

`security_invoker = true` means the caller's RLS on `billing_events` applies — so the
existing "Platform admin reads billing_events" policy already gates it. The page needs
`PlatformAdminRoute` for routing, but the data is protected regardless.

**Values:** `stream ∈ plan | merchant_cleaning | ai_credits | ad_management`,
`confidence ∈ certain | probable | inferred`.

---

## Requirements 1–3: yes, and the view dictates how

### 1. SaaS vs cleaning — `stream` splits it, no derivation needed

| Side | Streams |
|---|---|
| **SaaS** (they pay me) | `plan`, `ai_credits`, `ad_management` |
| **Cleaning** (customers pay the business) | `merchant_cleaning` |

Two separate totals, never summed into one. A combined "total revenue" figure is not
offered anywhere on the page — that is the blur the page exists to prevent.

### 2. Confidence tiers — folded is the bug, so three figures always

The column comment is explicit: *"Never total inferred rows into a headline figure
without saying so."* So:

- **Headline = certain + probable**, labelled as such
- **Inferred shown separately** as "unclassified", always visible, never a tooltip
- All three tiers listed with their own gross/reversal/net

The confidence meanings, from the column comment, belong on the page rather than in the
code: `certain` = booking/tip payment-intent match or dated before the platform existed
(2025-12-18); `probable` = payer email resolves to a known cleaning customer or org
owner; `inferred` = no signal, amount shape only.

### 3. Gross / reversals / net — read the columns, never rebuild them

The view comment names the exact mistake to avoid: *"filtering to charge.succeeded was
how one tier was reported gross of a $49 dispute while the others were net… do not
reconstruct one with a WHERE clause."*

So the page does **no arithmetic on `billing_events`** and no client-side filtering by
event type. It sums `gross_cents`, `reversal_cents` and `net_cash_cents` across the rows
the view returns, and displays all three as columns. `net = gross + reversal` holds
structurally because reversals are negative rows in the same population — the page
should **assert** that rather than compute net itself, and show a visible warning if it
ever fails.

---

## Requirement 4: the view CANNOT answer this

**"Who has paid, and when. Twelve businesses, with refunds and chargebacks against
each."**

The view's grain is `(month, stream, confidence)`. **There is no customer, organisation
or email column — zero.** Those columns exist on `billing_events`
(`organization_id`, `organization_name`, `customer_email`, `stripe_customer_id`) but
that table is explicitly not a reporting surface, and querying it directly is the thing
that produced both the `$2,179` and the `$49` errors.

**So this needs a second view, and I am not going to query around it.**

But there is a decision to make before that view is written, and it is the same
distinction requirement 1 exists to protect:

> **"Who has paid" means two different things per stream.**
> For `plan` / `ai_credits` / `ad_management`, the payer is one of the ~12 businesses
> paying TidyWise. For `merchant_cleaning`, the payers are those businesses' own
> cleaning customers — a completely different population, far more numerous, and not
> "businesses" at all.

A single customer-grain view would put both in one list and blur exactly what the page
is supposed to keep apart. **Recommendation: scope it to SaaS only** — a
`billing_saas_payers` view over `stream IN ('plan','ai_credits','ad_management')`,
grouped by organisation, with the same pinned population (`WHERE counts_as_cash`) and
the same structural netting.

Sketch for the Lovable prompt, to be written after you confirm the scope:

```
month-agnostic, one row per payer:
  organization_id, organization_name, customer_email,
  first_paid_at, last_paid_at,
  payment_events, reversal_events,
  gross_cents, reversal_cents, net_cash_cents,
  confidence_worst   -- the weakest tier contributing to this payer's total
```

`confidence_worst` matters: a payer whose total is entirely `inferred` should be visibly
different from one that is `certain`, or the per-payer list quietly reintroduces the
folding that requirement 2 forbids.

**Until that view exists, the page ships without the payer list**, with a placeholder
saying so — not an empty table, which would read as "nobody has paid".

---

## Requirement 5: the staleness banner — and a second blocker

**This is the requirement I would treat as load-bearing**, and it has a blocker.

`billing_backfill_jobs` is where `finished_at` lives. Its RLS policy exists — the
`FOREACH` loop in the schema migration created *"Platform admin reads
billing_backfill_jobs"*. **But the table GRANT was never given back:**

```sql
REVOKE ALL ON public.billing_backfill_jobs FROM anon, authenticated;   -- line 259
GRANT  ALL ON public.billing_backfill_jobs TO service_role;            -- line 266
-- no GRANT SELECT ... TO authenticated
```

In Postgres a policy operates *within* granted privileges, so the page gets
`42501 permission denied for table billing_backfill_jobs` regardless of the policy.

**That is my omission from the Task 1 prompt** — I granted SELECT on the two data tables
and the view, and wrote only `GRANT ALL … TO service_role` for the jobs table, assuming
it was internal. Task 5 needs to read it. One line fixes it:

```sql
GRANT SELECT ON public.billing_backfill_jobs TO authenticated;
```

### How the page behaves about freshness

Three states, and the third is the point:

| State | Condition | Display |
|---|---|---|
| **Fresh** | newest `finished_at` < 3 days | quiet line: "Data loaded 31 Jul, 14:52" |
| **Stale** | newest `finished_at` ≥ 3 days | **amber banner above the figures**: "These figures are N days old. New Stripe activity since then is not shown." |
| **Unknown** | the query errors or returns nothing | **amber banner**: "Could not determine when this data was last loaded — treat these figures as potentially out of date." |

**Unknown must not be silent, and must not be treated as fresh.** Before the grant lands
the page will sit in that state, which is the correct behaviour: it says the figures may
be stale rather than presenting them as current. That also makes the missing grant
self-announcing rather than something to remember.

The banner sits **above** the numbers, not beside them and not in a tooltip. A revenue
page that looks authoritative while being three weeks stale is precisely the failure
shape this plan exists to avoid.

Also worth showing, small, near the banner: `status` and `last_error` per resource from
the same table. A backfill that ran but `failed` on `charges` is a different kind of
stale from one that has not run, and the difference is visible in that table for free.

---

## Shape

```
PlatformRevenuePage
├── StalenessBanner            ← billing_backfill_jobs; fresh | stale | unknown
├── Two columns, never summed
│   ├── SaaS         (plan + ai_credits + ad_management)
│   │   ├── headline  net, certain+probable
│   │   ├── "+ $X unclassified (inferred)"
│   │   └── table: confidence × [events, gross, reversals, net]
│   └── Cleaning     (merchant_cleaning)
│       └── same structure
├── Monthly table                 month × stream × [gross, reversals, net]
└── SaaS payers                   ⛔ placeholder until the second view exists
```

## Tasks

- [ ] **1.** `useBillingRevenue` hook — one query against `billing_revenue_by_confidence`, no filtering by event type, no arithmetic beyond summing the view's own columns.
- [ ] **2.** `StalenessBanner` — reads `billing_backfill_jobs`; implement all three states, including `unknown` on error, and do not swallow the error into a quiet default.
- [ ] **3.** The two-column layout with confidence tiers, headline excluding `inferred`, and the unclassified remainder always visible.
- [ ] **4.** Monthly table.
- [ ] **5.** Assert `gross + reversal == net` per row; show a visible warning if it ever does not, rather than silently displaying a computed net.
- [ ] **6.** Route behind `PlatformAdminRoute`.
- [ ] **7.** Payer list — **blocked** on the second view and on the SaaS-only scope decision.

## What I need from you before building

1. **Requirement 4 scope** — SaaS payers only, as recommended? Or both populations in separate lists?
2. **The one-line grant** — small enough to fold into your next Lovable message; the page degrades honestly without it, so it need not block tasks 1–6.
