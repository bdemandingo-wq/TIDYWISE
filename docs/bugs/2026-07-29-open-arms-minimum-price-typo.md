# Open Arms Cleaning: Move In/Out minimum_price appears to be $0.45, not $45

**Status:** Open — **another org's data. Needs telling, not fixing.**
**Found:** 2026-07-29, in the pre-flight for the booking price floor
**Org:** Open Arms Cleaning (`info@openarmscleaning.com` — on the free-accounts
allowlist in `has_active_subscription()`)

---

## What was observed

The pre-flight query for the `bookings` price-floor trigger flagged one Open Arms
booking: **Move In/Out, total_amount `$0.00`, against a configured
`service_pricing.minimum_price` of `$0.45`.**

$0.45 is not a plausible minimum for a move-in/move-out clean. Comparable services
on the same platform carry minimums of $200–$350. It is almost certainly **$45
entered with a misplaced decimal** — or a value typed into a field expecting
dollars while thinking in some other unit.

## Why it matters, beyond being untidy

**At $0.45 the minimum price protects nothing.** Its two jobs both fail:

1. **As a pricing floor in `calculateBasePrice`** (`pricingEngine.ts:125`) — it is
   applied as `if (base > 0 && base < minimumPrice) base = minimumPrice`. At $0.45
   it can never raise anything, so any low base price passes through untouched.
2. **As the basis for the new price-floor trigger** — the floor is derived from
   `minimum_price`, so for this service the guard sits at roughly $0.22 and would
   admit essentially any forged total.

So this service is unprotected both before and after the trigger lands, and it is
the one service where the floor was most needed — a move-in/move-out clean is a
high-value job.

## The $0.00 booking is separately ambiguous

The flagged booking itself has `total_amount = 0.00`. That could be:

- a deliberately comped or zero-rated job,
- a recurring booking carrying a $0 template rate,
- or the only genuinely forged total in the table.

**It cannot be told apart from the data alone**, and the $0.45 minimum means no
guard would have stopped any of the three. If the recurring-template exemption
does not account for this row, it needs looking at individually.

## What to do

This is Open Arms' own pricing configuration, not TidyWise's, so the appropriate
action is to **tell them** rather than edit their data:

> "Your Move In/Out service has a minimum price of $0.45 configured, which we
> think was meant to be $45. As it stands, the minimum won't protect that service
> from underpriced bookings. Could you check and correct it?"

Do **not** silently change it to $45 — the intended figure is a guess, and it is
their commercial decision.

## Wider check worth running

If one org has a decimal-place error, others may. Read-only:

```sql
select sp.organization_id, o.name as org, s.name as service, sp.minimum_price
from public.service_pricing sp
join public.services s on s.id = sp.service_id
left join public.organizations o on o.id = sp.organization_id
where sp.minimum_price is not null
  and sp.minimum_price > 0
  and sp.minimum_price < 10
order by sp.minimum_price;
```

Any minimum under $10 for a cleaning service is worth a second look. Anything under
$1 is almost certainly a decimal error.
