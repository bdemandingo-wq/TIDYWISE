# Lovable prompt — cross-org loyalty injection (SECURITY, run first)

**Status:** not yet run. **Highest priority of the outstanding items.**
**Part B re-verified 2026-07-31** against `public-booking-submit`, the endpoint the booking form now uses.
**Found:** 2026-07-30 security review of `7cf7185d..HEAD`
**Severity:** HIGH — cross-tenant write to RLS-protected tables, permanent by design

---

## The finding

`award_loyalty_points()` (`20260729231023…sql:213`) is `SECURITY DEFINER`, so its writes bypass RLS. Last night's migration widened its trigger from `AFTER UPDATE` to **`AFTER INSERT OR UPDATE`** (`:262-266`) and added an INSERT branch (`:222-223`). The function authorizes nothing — its only inputs are client-supplied columns.

Its lookup has **no organization_id predicate** (`:237-239`):

```sql
SELECT id INTO existing_loyalty_id
FROM public.customer_loyalty
WHERE customer_id = NEW.customer_id;     -- no org scoping
```

And `bookings` / `customers` both carry, from `20260413170000:12-25` and never dropped:

```sql
CREATE POLICY "Anyone can create bookings" ON public.bookings
FOR INSERT TO public WITH CHECK (organization_id IS NOT NULL);
```

`TO public` includes `anon`. So a single unauthenticated INSERT naming any `organization_id` reaches a definer trigger that writes to `customer_loyalty` and `loyalty_transactions`.

**Why it is worse than a normal injection:** `lifetime_spend` is documented at `:50` as *"INCREMENT-ONLY — never decrement on any path"*, and it is the sole tier basis for `resolve_customer_tier()`. Injected spend is **permanent by design**. Nothing — refund, cancellation, status change — removes it. A customer can be pushed to an org's top tier with no supported way back.

The fake booking also lands in that org's completed-revenue reporting, and setting `service_id` to NULL additionally skips the new price-floor trigger.

---

## Part A — the one-line fix

```
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

SECURITY FIX. award_loyalty_points() is SECURITY DEFINER, so it bypasses RLS, and
its customer_loyalty lookup is not scoped by organization. Combined with the
AFTER INSERT trigger added on 2026-07-29, a booking INSERT naming any
organization_id can mutate another organisation's loyalty state.

In public.award_loyalty_points(), scope the existing-row lookup by organisation:

  SELECT id INTO existing_loyalty_id
  FROM public.customer_loyalty
  WHERE customer_id = NEW.customer_id
    AND organization_id = NEW.organization_id;

Then add a guard immediately after it, before any write: if the customer named by
NEW.customer_id does NOT belong to NEW.organization_id, return NEW without
awarding anything. A booking whose customer is in a different organisation is not
a legitimate award — it is either corrupt data or an injection attempt.

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = NEW.customer_id
      AND c.organization_id = NEW.organization_id
  ) THEN
    RETURN NEW;
  END IF;

Keep everything else as it is: the idempotency guard on booking_id, the
increment-only lifetime_spend, and the fact that it no longer writes tier.

Please also report how much damage already exists:

  -- loyalty rows whose organization_id disagrees with their customer's
  select cl.id, cl.customer_id, cl.organization_id as loyalty_org,
         c.organization_id as customer_org, cl.lifetime_spend, cl.lifetime_points
  from public.customer_loyalty cl
  join public.customers c on c.id = cl.customer_id
  where cl.organization_id is distinct from c.organization_id;

  -- loyalty transactions against a booking from a different org
  select lt.id, lt.customer_id, lt.organization_id as txn_org,
         b.organization_id as booking_org, lt.points, lt.created_at
  from public.loyalty_transactions lt
  join public.bookings b on b.id = lt.booking_id
  where lt.organization_id is distinct from b.organization_id;

  -- bookings inserted already-completed with no service (the injection shape)
  select id, organization_id, customer_id, total_amount, created_at
  from public.bookings
  where status = 'completed' and service_id is null
  order by created_at desc limit 50;

Do NOT delete anything based on those results — show me first.

Confirm the migration RAN, not just that a file was created.
```

---

## Part B — the question underneath: should `TO public` INSERT exist at all?

**My read: almost certainly not, and narrowing it is the real fix rather than patching the trigger.**

The policy presumably exists so the public booking form can create bookings without a login. **It isn't what makes that work.**

**Re-verified 2026-07-31, after the booking form was moved to a new endpoint.** The form now submits to `public-booking-submit` rather than `external-booking-webhook`, so the original evidence was re-checked rather than assumed to still hold:

| Path | Client | RLS applies? |
|---|---|---|
| `public-booking-submit` — **the browser's path now** | `createClient(URL, SUPABASE_SERVICE_ROLE_KEY)` (`:74`), and it passes that same client into `_shared/create-booking-from-payload.ts` | **no** |
| `external-booking-webhook` — integrations | `SUPABASE_SERVICE_ROLE_KEY` | **no** |
| `ingest-external-booking` | `SUPABASE_SERVICE_ROLE_KEY` | **no** |
| `booking-chatbot` | `SUPABASE_SERVICE_ROLE_KEY` | **no** |
| `process-migration-import` | see below | **no** |
| `RecurringBookingsPage.tsx:489,537` — the only direct `bookings` inserts in `src/` | authenticated admin screen | yes, as a member |
| admin stepper (`useCreateBooking`), quote conversion | authenticated | yes, as a member |

**The one open question from the original draft is now closed.** `process-migration-import` referenced both `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which left it unclear. It creates two clients: the **anon** one (`:110-112`) is used **only** for `auth.getUser(token)` to verify the caller's JWT and never writes; both the `customers` insert (`:202`) and the `bookings` insert (`:286`) go through `adminClient` (`:140-142`, service role).

**So nothing, anywhere, inserts bookings or customers as `anon`.** The policy is vestigial — a leftover from before the webhooks existed — and narrowing it should break nothing.

**Recommendation, in order of preference:**

1. **`WITH CHECK (public.is_org_member(organization_id))`** — the correct predicate. Since every RLS-governed insert path is an org member, and the public form bypasses RLS via service_role, this should break nothing while closing cross-tenant insertion outright.
2. If (1) is judged too risky without more testing, **`TO authenticated`** at minimum. That reduces the attacker set from "anyone on the internet" to "anyone with any account in any of the 87 orgs" — better, but note it does **not** close the finding, because the `WITH CHECK` still only requires `organization_id IS NOT NULL`.
3. Do nothing to RLS and rely solely on Part A. Weakest: it fixes loyalty specifically and leaves the general ability for anyone to insert bookings and customers into any organisation.

`customers` has the identical policy (`20260413170000:12-18`) and the same reasoning applies — the public form creates its customer through the same webhook.

**One thing I still cannot see from here.** Partner integrations, embedded forms on org websites, or anything calling PostgREST directly with the anon key are invisible to a repo search. Everything *in this codebase* is accounted for above, but ask Lovable to confirm no external consumer depends on anon INSERT before narrowing.

**Do not let this break the booking form.** It was dead from ~2026-05-09 until Task 1 restored it on 2026-07-31. Since `public-booking-submit` uses service_role it is unaffected by any RLS change — but that is precisely the claim worth re-checking after the migration lands, because it is the path that just came back.

Suggested check before changing anything:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('bookings','customers')
  and cmd = 'INSERT'
order by tablename, policyname;
```

**Do Part A regardless of what is decided about Part B.** Defence in depth: even with membership-scoped inserts, a definer trigger that writes across organisations on unvalidated input is a bug in its own right.
