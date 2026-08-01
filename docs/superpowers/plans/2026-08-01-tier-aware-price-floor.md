# Tier-aware price floor — plan

**Status:** planned, not built. One blocker found that changes the shape of the job.

---

## The blocker: a tier's discount is not data

`loyalty_tier_settings` stores benefits as a **free-text JSONB array**:

```sql
SELECT 'Silver'  ::TEXT, 2,  500, 1999, '["5% discount", "Priority booking"]'::JSONB, ...
SELECT 'Gold'    ::TEXT, 3, 2000, 4999, '["10% discount", "Priority booking", "Free add-on"]'::JSONB, ...
SELECT 'Platinum'::TEXT, 4, 5000, NULL, '["15% discount", ...]'::JSONB, ...
```

`"10% discount"` is a **marketing label**, not a rate. There is no
`discount_percent` column on a tier, so a trigger cannot ask "what discount is
this customer entitled to?" — the answer only exists as English inside a
benefits list.

So the floor cannot be made tier-aware as things stand. Not because there is no
pricing engine, but because **the tier discount does not exist as a number
anywhere in the schema.**

This is a smaller gap than a pricing engine and a bigger one than a trigger
change. It is one column plus a backfill decision.

### Prerequisite

```sql
ALTER TABLE public.loyalty_tier_settings
  ADD COLUMN discount_percent numeric NOT NULL DEFAULT 0
  CHECK (discount_percent >= 0 AND discount_percent < 100);
```

Backfill is a **product decision, not a migration detail**: parsing `"10%
discount"` out of the benefits string would make the label authoritative, and
those strings were written as copy. Safer to default every tier to 0 and have
each org set its own — which also means the floor starts permissive and tightens
as orgs opt in, rather than rejecting bookings on day one from a parsed guess.

---

## What the floor guards, precisely

The trigger `enforce_booking_minimum_price` currently rejects:

```
NEW.total_amount < min(service_pricing.minimum_price) * 0.5
```

The `0.5` is blunt headroom for the frequency discount, which the client applies
*after* everything else. That has two consequences:

**It is too loose.** A customer claiming a tier they have not earned sends a
price 5–15% below what they owe. A 15% discount lands at 85% of the real price —
nowhere near the 50% line. The floor cannot tell an earned discount from a
claimed one, which is exactly the hole.

**It is also already too tight, latently.** `RecurringDiscountConfig` allows
0–99 per frequency. An org configuring weekly at 55% would have its own
legitimate bookings rejected today, because `min * 0.45 < min * 0.5`. Nobody has
hit it because the defaults are 15/25/30.

---

## The composed bound

`bookings` carries everything needed — this is the part that turned out better
than expected:

| column | use |
|---|---|
| `frequency` | which frequency discount applied (public form writes it) |
| `custom_frequency_days` | custom frequencies carry their own `discount_pct` |
| `customer_id` | input to `resolve_customer_tier()` |
| `discount_amount` | promo codes, applied on top |
| `service_id`, `organization_id` | the minimum lookup that already exists |

So the frequency does **not** have to be assumed at its worst case. The bound
composes the two discounts multiplicatively, in the order the client applies
them:

```
floor = min(service_pricing.minimum_price)
        × (1 − frequency_discount_pct(NEW.frequency, org) / 100)
        × (1 − tier_discount_pct(resolve_customer_tier(NEW.customer_id), org) / 100)
        × TOLERANCE

reject when  (NEW.total_amount + COALESCE(NEW.discount_amount, 0)) < floor
```

`discount_amount` is **added back** before comparing. A promo code is a
deliberate, recorded reduction; the floor is guarding against an *unrecorded*
one.

`TOLERANCE = 0.95`. It covers `Math.round` on the final total and nothing else.
Everything else in `calculateTotal` either adds (extras, pet fee, home
condition), is already floored at `minimum_price` client-side (room reductions),
or multiplies upward (surge). The pre-discount total is therefore never below
`minimum_price`, which is what makes 5% sufficient where 50% was needed.

### Worked numbers

Taking `min = $100`, weekly frequency at the default 30%:

| case | client sends | floor | outcome |
|---|---|---|---|
| weekly, no tier | $70.00 | 100 × .70 × 1.00 × .95 = **$66.50** | passes |
| weekly, Gold 10% | $63.00 | 100 × .70 × .90 × .95 = **$59.85** | passes |
| weekly, Platinum 15% | $59.50 | 100 × .70 × .85 × .95 = **$56.53** | passes |
| **no tier, claims Gold** | $63.00 | 100 × .70 × 1.00 × .95 = **$66.50** | **rejected** |
| **no tier, claims Platinum** | $59.50 | **$66.50** | **rejected** |
| weekly at 55% (org-configured), no tier | $45.00 | 100 × .45 × 1.00 × .95 = **$42.75** | passes *(fails today)* |
| one-time, no tier | $100.00 | 100 × 1.00 × 1.00 × .95 = **$95.00** | passes |

The composed bound is **simultaneously tighter against fraud and more permissive
for legitimately configured orgs** than the flat 50%. That is the answer to "too
tight blocks real recurring bookings; too loose leaves the hole" — the two are
only in tension while the bound is a single constant.

### Skips to keep

The three existing skips stay, for the same reasons:

1. `service_id IS NULL OR total_amount IS NULL` — nothing to compare.
2. `recurring_booking_id IS NOT NULL` — generated series, admin-side only.
3. no `minimum_price` configured for that service.

And one to add:

4. `customer_id IS NULL` → treat tier discount as 0. A public booking from a new
   customer has no tier, and `resolve_customer_tier(NULL)` already returns NULL.

---

## Order of work

1. **Add `discount_percent` to `loyalty_tier_settings`,** default 0. Ship alone
   and let orgs set it. Nothing reads it yet, so it cannot break anything.
2. **Read-only half** — show the resolved tier at booking time and record it on
   the booking. Needs no price authority and is useful without the rest.
3. **Tier-aware floor** — only once (1) has real values in it, otherwise every
   tier reads 0% and the floor is exactly the frequency-only bound.

Steps 1 and 3 are `supabase/` and ship as Lovable prompts. Step 2 is `src/`.

---

## What this still does not do

It stops a customer claiming a discount they have not earned. It does **not**
stop a client sending *full* price when a discount was due — that costs the
customer, not the business, and is visible to them on the confirmation.

Closing that direction needs the server to compute the price, not check it,
which is the pricing engine this was cut for in the first place. The floor is a
guard, not an authority, and this plan does not pretend otherwise.
