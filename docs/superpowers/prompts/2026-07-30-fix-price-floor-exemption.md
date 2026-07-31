# Lovable prompt — the price floor's exemption is client-supplied

**Status:** not yet run. Run **after** `2026-07-30-fix-loyalty-trigger-cross-org.md`.
**Found:** 2026-07-30 security review of `7cf7185d..HEAD`
**Severity: DOWNGRADED to LOW on 2026-07-31** — re-verified after the booking-form split. The browser and integration paths are now closed by construction; one attack path remains, and Part B of the loyalty prompt closes it. See "What changed" below.

---

## The finding

`enforce_booking_minimum_price()` (`20260730022045…sql:18-20`) skips the floor entirely when a column is non-null:

```sql
-- Skip 2: recurring-series bookings. Set only by the admin Recurring Bookings
-- generator via a real FK; not reachable from the public booking form or any
-- webhook path.
IF NEW.recurring_booking_id IS NOT NULL THEN
  RETURN NEW;
END IF;
```

**Nothing enforces that comment.** `recurring_booking_id` is a plain nullable column on `bookings`, and the INSERT policy governing the untrusted path (`"Anyone can create bookings" … WITH CHECK (organization_id IS NOT NULL)`) constrains no other column. The FK added in `20260730022013…sql` requires the uuid to **exist**; it does not require it to belong to `NEW.organization_id`.

So the actor the floor is meant to constrain is the same actor who controls the exemption. Set any valid `recurring_bookings.id` — including one from your own org — and the floor never runs.

**This does not mean the floor was wrong to ship.** The rollback test proved the floor works; it did not test whether the exemption is forgeable. That is the gap.

Two smaller gaps in the same trigger, worth closing together:
- `service_id IS NULL` skips it (`:11-13`), and `service_id` is nullable
- It is `BEFORE INSERT` only (`:47`) — a compliant price can be inserted and then lowered by anyone with UPDATE on `bookings`

---

## What changed on 2026-07-31 — and why NOT to write the obvious fix

The suggestion was to have `public-booking-submit` strip `recurring_booking_id` from
browser payloads, since a browser has no legitimate reason to name a recurring series.

**Do not write that. It is already the case, twice over, by construction.**

1. **`recurring_booking_id` is not in `BookingSchema`** (`_shared/create-booking-from-payload.ts`).
   Zod's default `.object()` **strips** unknown keys, so it never reaches `parseResult.data`.
2. **The booking insert is an explicit field allowlist** — every column is named
   individually from `payload.*`. Even if the field survived parsing it could not be written.
3. `grep recurring_booking_id` across `public-booking-submit/index.ts` and
   `_shared/create-booking-from-payload.ts` returns **nothing**. It is not referenced at all.

**The integration path inherits the same protection.** `external-booking-webhook` now
parses with the same `BookingSchema` (`:66`) and delegates to `createBookingFromPayload`
(`:149`), so it cannot write the field either.

**The only writer of `recurring_booking_id` in the whole codebase** is
`RecurringBookingsPage.tsx:396` — the authenticated admin recurring generator, which is
precisely the legitimate case the exemption exists to serve.

### So what is actually still exposed

Exactly one path: **a direct PostgREST INSERT as `anon`**, permitted by the
`"Anyone can create bookings" … TO public WITH CHECK (organization_id IS NOT NULL)`
policy. That caller bypasses both edge functions and can set any column, including a
forged `recurring_booking_id`.

**That is the same policy Part B of the loyalty prompt proposes narrowing.** If Part B is
accepted, this hole closes as a side effect and FIX 1 below becomes belt-and-braces
rather than necessary.

**Recommended sequencing:** decide Part B first. If it is accepted, run this prompt
afterwards anyway — a `SECURITY DEFINER`-adjacent trigger that trusts an unvalidated FK
is worth fixing on its own merits — but at LOW priority rather than as a live hole.

---

## The prompt

```
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: enforce_booking_minimum_price() skips its floor when
NEW.recurring_booking_id IS NOT NULL. The column comment asserts that value is
"set only by the admin Recurring Bookings generator" and "not reachable from the
public booking form or any webhook path" — but nothing enforces that. It is a
plain nullable column on a table with a permissive INSERT policy, and the FK only
requires the referenced row to exist, not to belong to the same organisation.

So the exemption can be forged by supplying any valid recurring_bookings.id,
including one from a different organisation, which bypasses the floor entirely.

FIX 1 — make the exemption prove itself.

Replace the bare NOT NULL check with one that verifies the referenced recurring
series actually belongs to the SAME organisation as the booking:

  IF NEW.recurring_booking_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.recurring_bookings rb
      WHERE rb.id = NEW.recurring_booking_id
        AND rb.organization_id = NEW.organization_id
    ) THEN
      RETURN NEW;   -- genuine same-org recurring series: floor does not apply
    END IF;
    -- A recurring_booking_id from another organisation is not a legitimate
    -- exemption. Fall through to the floor rather than honouring it.
  END IF;

Falling through rather than raising is deliberate: a cross-org id is most likely
an attempt to dodge the floor, and the floor is the correct response. Raising
would also be defensible — tell me if you prefer that and why.

FIX 2 — consider an organisation-scoped FK.

The FK on bookings.recurring_booking_id has no organisation component, so the
database cannot express "this must be MY org's series". A composite FK on
(recurring_booking_id, organization_id) referencing
recurring_bookings(id, organization_id) would enforce it structurally rather than
in trigger logic. That needs a unique constraint on
recurring_bookings(id, organization_id) first.

Please tell me whether that constraint already exists live before adding it —
this repo has been bitten by assuming a constraint's absence from migration
files. Do NOT add the composite FK in the same migration as FIX 1; FIX 1 is the
security fix and should land on its own.

FIX 3 — the service_id skip.

The trigger also returns early when NEW.service_id IS NULL, which is a second
free bypass: insert with no service and no floor applies. That skip exists
because recleans legitimately have no service_id (BookingStepper builds them
that way). Please report how often it is actually hit, so we can decide whether
to narrow it rather than guess:

  select
    count(*) filter (where service_id is null)                     as no_service,
    count(*) filter (where service_id is null and status='completed') as no_service_completed,
    count(*) filter (where service_id is null and total_amount < 1)   as no_service_under_1
  from public.bookings
  where created_at > now() - interval '90 days';

NOT IN SCOPE for this migration: extending the trigger to UPDATE. An admin
lowering a price after the fact is a legitimate authenticated business action,
and gating it needs its own decision.

AFTERWARDS please paste:

  -- bookings whose recurring_booking_id points at another org's series
  select b.id, b.organization_id as booking_org, rb.organization_id as series_org,
         b.total_amount, b.created_at
  from public.bookings b
  join public.recurring_bookings rb on rb.id = b.recurring_booking_id
  where rb.organization_id is distinct from b.organization_id;

  select pg_get_functiondef('public.enforce_booking_minimum_price()'::regprocedure);

An empty first result is the expected and good outcome — it means the exemption
has not been abused yet, only that it could be.

Confirm the migration RAN, not just that a file was created.
```

## Note on ordering

Both this and the loyalty trigger fix are downstream of the same root cause: `bookings` accepts inserts from `TO public` with a `WITH CHECK` that only requires `organization_id IS NOT NULL`. If Part B of the loyalty prompt is accepted and that policy is narrowed to `is_org_member(organization_id)`, the attacker set for this finding shrinks to org members — who can already set prices through the admin UI, making this much less interesting.

Worth deciding the RLS question first, then re-reading this one. It may drop from MEDIUM to LOW.
