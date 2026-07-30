# Self-owned Stripe revenue data — what exists, what's missing, what backfill costs

**Investigated:** 2026-07-30. Read-only. No UI design, as asked.
**Goal being served:** an owned, exportable copy of platform revenue history that stays
readable if access to the shared Stripe account is ever lost.

---

## The framing that decides everything: there are two Stripes

This project talks to Stripe in two completely separate roles, and almost every
existing table and function belongs to the **wrong one** for your purpose.

| | **Platform** | **Connect** |
|---|---|---|
| Account | TidyWise's own — the one shared with your co-admin | Each cleaning business's own account |
| Money | the 87 orgs paying **you** | orgs charging **their** cleaning customers |
| Key | `STRIPE_SECRET_KEY` env | per-org token via `get_org_stripe_secret` |
| **This is what you want** | ✅ | ❌ |

**`stripe-analytics-sync` is Connect.** It calls `resolveCallerOrg(req)`, fetches that
org's key, and reports that org's charges. It has nothing to do with your revenue. If
you were hoping it was a head start, it isn't — it is a different product feature that
happens to share a vocabulary.

Anything built for this must exclude `create-stripe-invoice`, `send-invoice` and
`process-deposit` entirely — those are Connect money flows and would inflate your
revenue by the entire GMV of 87 cleaning businesses.

---

## 1. What's already captured

Short version: **almost nothing durable, and the one table that sounds right is neither
current nor complete.**

### `stripe_subscriptions` — current-state mirror, no money, goes stale immediately

```sql
organization_id, stripe_subscription_id, stripe_customer_id, stripe_price_id,
status, plan, billing_interval, current_period_end, cancel_at_period_end,
trial_end, metadata, created_at, updated_at
```

Three problems, each independently fatal for MRR:

1. **No amount column.** No `unit_amount`, no `currency`, no `quantity`. You have a
   `stripe_price_id` and nothing to resolve it against locally. MRR is not computable
   from this table at any point, past or present.
2. **Written only at checkout.** The sole writer is
   `reconcile-checkout-session/index.ts:403`. `stripe-subscription-webhook` — which
   handles `customer.subscription.created/updated/deleted` — **never touches it.** It
   only calls `updateOrgPlanTier` (`:101`). So `status`, `current_period_end`,
   `cancel_at_period_end` and `plan` freeze at their checkout-time values and never
   move again. A customer who upgraded, downgraded or cancelled six months ago still
   reads as whatever they bought on day one.
3. **`ON DELETE CASCADE` on `organization_id`.** Delete an org and its billing history
   vanishes. `delete-my-organization/index.ts:25` already operates on this table.
   For a revenue ledger that is disqualifying on its own.

### `stripe_webhook_events` — an idempotency ledger, not an event log

```sql
event_id TEXT PRIMARY KEY, event_type TEXT, source TEXT, processed_at TIMESTAMPTZ
```

No payload, no amount, no customer, no object id. It exists solely so a redelivered
webhook is not processed twice. **Nothing can be reconstructed from it.** This is the
table most likely to be mistaken for a history — it is not one.

### `stripe-analytics-sync` — persists nothing at all

Despite "sync" in the name, it contains no `insert` or `upsert`. It paginates
`charges.list`, `refunds.list` and `disputes.list` from a **Connect** key and returns
them in the HTTP response. Close the tab and the data is gone. It is a read-through
proxy, so it also fails the core requirement outright: nothing survives losing API
access, because nothing was ever stored.

### What IS well modelled — and is the template

Two tables already do roughly the right thing, which is useful precedent:

**`lifetime_access_purchases`** — the only platform table storing money:
```sql
email, user_id, organization_id, stripe_session_id, stripe_payment_intent_id,
amount_cents integer NOT NULL DEFAULT 30000, created_at
```
Note `organization_id` is `ON DELETE SET NULL` and `email` is `NOT NULL` — so the
purchase record survives org deletion. That is exactly the right instinct.

**`ad_management_subscriptions`** — the best-shaped revenue table in the codebase:
```sql
organization_id, platform, stripe_subscription_id, stripe_customer_id,
stripe_price_id, status, monthly_amount_cents, started_at, cancelled_at,
cancellation_reason, created_at, updated_at
```
It has the amount, the status, the start, the cancellation **and a reason**. If
`stripe_subscriptions` looked like this, most of questions 3 and 4 would already be
answered.

### Missing, specifically

| For | Missing |
|---|---|
| MRR | amount, currency, billing interval on plan subscriptions; discount state |
| MRR over time | any event history whatsoever — only current state exists, and it is stale |
| Churn | cancellation timestamp and reason for plan subs (ad-management has both) |
| Churn cause | any record of failed payments |
| One-off revenue | dollar amounts for AI credits (see §5) |
| Survivability | anything not `ON DELETE CASCADE`d to `organizations` |

---

## 2. Can history be backfilled?

**Yes for money. No for events. That split is the single most important constraint.**

### The hard limit: Stripe's Events API retains 30 days

`GET /v1/events` only returns roughly the last 30 days. So the literal event stream —
"this subscription was upgraded on 4 March" — **cannot be recovered** beyond a month
back, from any account, ever. That is not a rate limit you can work around.

### What has no retention limit

These return full account history, back to your first transaction:

| Endpoint | Gives you |
|---|---|
| `invoices.list` | **the spine.** amount_paid, amount_due, currency, period_start/end, subscription, customer, discounts, line items, status |
| `charges.list` | actual money movement, incl. failures with `failure_code` |
| `refunds.list` | refunds with reason |
| `subscriptions.list` (`status: 'all'`) | **including cancelled** — with `canceled_at`, `cancellation_details`, `items` |
| `checkout.sessions.list` | ties AI-credit and lifetime purchases to their money |
| `customers.list` | email ↔ customer id, needed to survive losing the account |
| `disputes.list` | chargebacks |

**So the upgrade/downgrade timeline is not lost — it is derivable.** Consecutive
invoices for the same subscription carry the price and period; a change in line-item
price between invoices *is* the upgrade, dated. You reconstruct the events from the
invoices rather than reading them from the event log.

### Cost, concretely

Rate limit is 100 read requests/second in live mode; pagination is 100 objects/page.
For a business of this size — 87 orgs, low thousands of invoices at most — the entire
history is **tens of seconds of API time**. Volume is not the problem.

The real constraints are operational, not quantitative:

1. **Edge function wall-clock.** A single run cannot page the whole account reliably.
   Needs a cursor persisted between invocations (Stripe's `starting_after`) and a
   resumable job row, not one long request. The existing `stripe-analytics-sync` loops
   `while (hasMore)` with no cursor persistence — do not copy that pattern for a
   backfill.
2. **Idempotency.** Must be safely re-runnable. Natural keys exist — every Stripe
   object id is unique — so `UPSERT ON CONFLICT (stripe_id)` makes reruns free.
3. **Expansion limits.** Stripe caps `expand` depth at 4 levels and expanding lists is
   restricted. Practically: fetch invoices with `expand: ['data.discounts']` and take
   line items from the invoice body, rather than trying to expand everything in one
   pass.
4. **Read-only key.** This backfill only reads. Use a **restricted key** with read
   permissions, not the live secret — meaningfully lower risk for a job whose whole
   point is being run repeatedly.

**Verdict: a one-time backfill is comfortably feasible.** It is a day of careful work,
not a project. The thing that makes it urgent rather than optional is the 30-day event
window — every day you wait, another day of *event-level* detail expires, even though
the invoice-level record stays available indefinitely.

---

## 3. What MRR actually needs, and what today's data supports

**Today: nothing. There is no amount stored against a plan subscription anywhere.**
That is the whole answer for current data — not "partially", not "approximately".

After an invoice-based backfill, each requirement:

| Requirement | Feasible? | How |
|---|---|---|
| Monthly/annual normalisation | ✅ | subscription item `price.recurring.interval` + `interval_count`; annual → ÷12 |
| Exclude trials | ✅ | `status = 'trialing'` contributes 0; `trial_end` already exists on the table |
| Apply discounts | ✅ | invoice `total_discount_amounts`, and `discount.coupon.percent_off/amount_off` on the subscription |
| Upgrades/downgrades as events | ⚠️ derived | diff consecutive invoice line-item prices per subscription; the *date* is exact, the *reason* is not recoverable |
| Multiple streams | ⚠️ | plan subs **and** ad management both recur — see §5 |

### The trap worth stating plainly: MRR ≠ cash collected

Stripe prorates. An upgrade mid-cycle produces an invoice with a partial credit line
and a partial charge line, so that invoice's total is neither the old nor the new
monthly rate. **Summing invoice totals gives you cash, not MRR.**

Two different numbers, both wanted, computed differently:

- **MRR** — from the *subscription's current price × quantity*, normalised to monthly,
  as at a point in time. Ignore proration entirely.
- **Cash / recognised revenue** — from `invoice.amount_paid` less refunds. This is what
  actually hit the bank.

A ledger that stores both the invoice line items *and* the subscription price snapshot
can answer both. One that stores only invoice totals can only answer the second, and
will quietly report a wrong MRR that looks plausible.

---

## 4. Churn — voluntary vs involuntary

**Yes, cleanly distinguishable — and unlike the event timeline, this one is fully
backfillable**, because it lives on the subscription object rather than in the event
stream.

Stripe puts it in `subscription.cancellation_details`:

| Field | Meaning |
|---|---|
| `reason: 'cancellation_requested'` | **voluntary** — they chose to leave |
| `reason: 'payment_failed'` | **involuntary** — dunning exhausted, card problem |
| `reason: 'cancellation_requested'` + `cancel_at_period_end` earlier | voluntary, non-immediate |
| `feedback` | Stripe's structured reason (`too_expensive`, `missing_features`, …) if collected |
| `comment` | free text |

Corroborating signals, also backfillable:

- `subscriptions.list({ status: 'canceled' })` retains cancelled subscriptions
  indefinitely, with `canceled_at` and `ended_at`.
- **Involuntary has a fingerprint**: a run of `charge.failed` / unpaid invoices with
  `failure_code` (`card_declined`, `expired_card`, `insufficient_funds`) immediately
  before the cancellation. `charges.list` and `invoices.list` both retain these.
- `status` passing through `past_due` → `unpaid` before `canceled` is the dunning path;
  a jump straight to `canceled` is voluntary.

**Today you can distinguish neither**, because no cancellation is recorded at all for
plan subscriptions — `stripe_subscriptions` has no `cancelled_at`, no reason, and is
not updated when a subscription ends. `ad_management_subscriptions` already has both
columns, which is the shape to copy.

Worth capturing during backfill even though you did not ask: **failed-payment recovery
rate**. If involuntary churn is significant, it is usually the cheapest revenue in the
business to recover, and the data comes free with the same fetch.

---

## 5. One-time purchases — and a recurring stream you may not be counting

Confirmed by auditing every `mode:` in the checkout functions:

### Platform one-off (`mode: "payment"`)
- **AI credits** — `buy-ai-credits`. Credited via `stripe-ai-credits-webhook` into
  `ai_credit_ledger_entries`, which stores `delta` (credits), `reason` and
  `stripe_session_id` — **but no money.** The dollar amount exists only in Stripe.
  The stored `stripe_session_id` is the join key that makes backfilling the amounts
  straightforward, so this is recoverable rather than lost.
- **Lifetime access** — `buy-lifetime` / `create-lifetime-checkout` →
  `lifetime_access_purchases`, which **does** store `amount_cents`. The one platform
  revenue stream already owned in dollars.

### Platform recurring (`mode: "subscription"`)
- **Plan subscriptions** — `create-subscription`. Basic $49 / Pro $97 / Custom $197
  monthly (`ChoosePlanPage.tsx:30-63`).
- **Ad management** — `buy-ad-management`, `monthly_amount_cents DEFAULT 40000` —
  **$400/month per platform**, and an org can hold up to three (`google_search`,
  `google_lsa`, `facebook`). At $400 this is potentially larger per customer than the
  plan subscription itself. **If your mental MRR is plan-tiers only, it is materially
  understated.**

### NOT platform revenue — must be excluded
`create-stripe-invoice`, `send-invoice`, `process-deposit` — orgs charging their own
cleaning customers through Connect. Counting these would inflate your revenue by the
entire transaction volume of 87 businesses.

---

## 6. Export — the shape that survives losing Stripe access

This is the requirement everything else should bend to, so working backwards from it:

**Readable without the API. Readable without the app. Readable after an org is
deleted. Readable by someone who is not you.**

### Two tables, not one

**A. `billing_events` — append-only, one row per money movement**

The properties that matter, in priority order:

1. **Append-only.** Never `UPDATE`, never `DELETE`. A correction is a new row. History
   that can be rewritten is not a record.
2. **`organization_id` must NOT be `ON DELETE CASCADE`** — `SET NULL`, exactly as
   `lifetime_access_purchases` does it. This is the single most important schema
   decision on the page. `stripe_subscriptions` cascades today, so deleting an org
   destroys its revenue history, and `delete-my-organization` already does that.
3. **Denormalised identity.** Store `customer_email` and `organization_name` **as text
   on the row**, not only as foreign keys. A CSV that says `org_id: 7f3a…` is worthless
   to a buyer, an accountant, or you in three years. It must read standalone.
4. **Money as integer cents plus explicit currency.** Never floats.
5. **`occurred_at` from Stripe, not `created_at` from Postgres.** When it happened, not
   when you happened to sync it. Keep both.
6. **`raw JSONB` of the Stripe object.** Storage is trivial; the questions you have not
   thought of yet are all answerable from it, without re-fetching from an account you
   may no longer have. This is what makes the copy genuinely self-sufficient.
7. **Unique on the Stripe object id**, so backfills and live webhooks converge instead
   of duplicating.

Rough column set: `id, occurred_at, synced_at, type, stripe_object_id,
stripe_customer_id, stripe_subscription_id, stripe_invoice_id, organization_id,
organization_name, customer_email, amount_cents, currency, fee_cents, net_cents,
description, raw`.

`type` covering: `invoice.paid`, `charge.succeeded`, `charge.failed`, `refund`,
`dispute`, `subscription.started`, `subscription.changed`, `subscription.cancelled`,
`credits.purchased`, `lifetime.purchased`.

**B. `billing_subscription_snapshots` — state over time**

Events alone cannot answer "what was MRR on 1 June". One row per subscription per
change, carrying `subscription_id, effective_from, effective_to, plan, interval,
unit_amount_cents, quantity, currency, discount_pct, status, cancellation_reason`.
MRR at any date becomes a single query against rows whose interval contains that date —
no recomputation from events, no API.

### Export mechanics

Given the above, export is deliberately boring, which is the point:

- `COPY (SELECT …) TO STDOUT WITH CSV HEADER` — or a plain `select *` in any SQL client
- Both tables are flat, denormalised and self-describing
- **No API, no app, no auth beyond database access**
- Worth scheduling a recurring dump to storage you control separately from Supabase —
  the argument that Stripe access can be lost applies equally to Supabase access

### One consequence worth deciding early

If the ledger must survive **you** losing access, it should not live only inside the
Lovable-managed Supabase project either. That project is reachable only through
Lovable's UI (no CLI, no dashboard login — see CLAUDE.md). A periodic CSV or Postgres
dump to storage you personally control is what actually satisfies the requirement.
Building the table without that step gets you a better analytics page and only
half the ownership you are asking for.

---

## Suggested order, if this gets built

1. **Schema first** — `billing_events` + `billing_subscription_snapshots`, with the
   no-cascade and denormalised-identity rules baked in. Nothing else matters if the
   shape is wrong.
2. **Backfill job** — resumable, cursor-persisted, idempotent, restricted read key.
   Invoices and subscriptions first (they are the spine), then charges/refunds/
   disputes, then checkout sessions for AI credits and lifetime.
3. **Live capture** — extend `stripe-subscription-webhook` to append to the ledger
   instead of only setting `plan_tier`, and fix the fact that it never updates
   `stripe_subscriptions`. Until this exists, the backfill decays from day one.
4. **Export** — the scheduled dump. Before any UI.
5. **Display** — last, and cheap by then, because the questions become plain SQL.

## Caveats on this investigation

- Everything above is from **code and schema reading**. The live database was not
  queried — the main Supabase project is Lovable-managed and unreachable from here
  (CLAUDE.md), so per rule 4 none of the migration-derived schema is proof of live
  state. Confirm column lists live before building.
- Stripe API retention and rate-limit figures are from the published API behaviour, not
  measured against your account. The 30-day Events window is the one worth verifying
  yourself before relying on the "derive from invoices" approach, since it drives the
  whole design.
- Row counts are unknown, so the backfill cost estimate is inferred from 87 orgs rather
  than from an actual invoice count. Ask Stripe for a total before committing to an
  approach — `invoices.list` with `limit: 1` returns `has_more` and lets you page-count
  cheaply.
