# QA fixture rebuild — ⛔ PARKED 2026-07-29

> **PARKED. Do not start executing this plan.** Both load-bearing mechanisms were
> ruled out by the owner on 2026-07-29, and every phase below depends on one or
> the other. The analysis is kept because it is correct and the constraints are
> worth not rediscovering — but the *approach* needs replacing, not resuming.
>
> ### Constraint 1 — `@tidywise1.com` is not usable
>
> Ownership of that domain **could not be confirmed**. It may not belong to us.
> So the `has_active_subscription()` owner-email allowlist branch is off the
> table, and with it Phase 1 and everything gated on Org A being non-trial
> (3.1, 3.2, 3.4, 3.6, 3.9, the admin half of 9.1).
>
> The only other way past that gate is fabricating a `stripe_subscriptions` row
> with `status='active'`, which is **explicitly rejected**: it would make the
> database claim a Stripe subscription that does not exist upstream, visible to
> `stripe-analytics-sync`, `reconcile-checkout-session`, and
> `stripe-isolation-audit`. Not an acceptable blast radius for a test fixture.
>
> ### Constraint 2 — no synthetic rows in TIDYWISE
>
> The owner will not accept `QA-TEST-DELETE` customers in the real customer list.
> That removes Phases 4 and 5, and with them the pinned cross-org leak marker —
> so 1.9 falls back to `limit=1` grabbing an arbitrary, probably real, probably
> different-each-run customer. Which was one of the two problems this plan set
> out to fix.
>
> ### What a rethink has to solve
>
> Any replacement approach needs an answer to all four:
>
> 1. **How does a fixture org pass `has_active_subscription()`** without a fake
>    Stripe row and without a domain we cannot verify? Options worth exploring:
>    add a dedicated, clearly-named test org to the explicit allowlist inside the
>    function (a migration to security-relevant code — needs its own review); or
>    change the affected specs to seed via an edge function running as
>    `service_role`, which bypasses RLS entirely and sidesteps the gate.
> 2. **Where does the cross-org leak marker live** if not in TIDYWISE? A third
>    disposable org would keep TIDYWISE clean, but then Org B is no longer a real
>    tenant with real data, which is precisely what made
>    `cross-org-isolation.spec.ts` a genuine probe rather than a synthetic one.
>    That trade-off is the crux and should be decided deliberately.
> 3. **Do the two existing auth users still exist?** Never established — Phase 0
>    was not run. Until it is, "rebuild" vs "reset a password" is unknown, and
>    they are very different amounts of production change.
> 4. **Why did the credentials stop working?** Also unknown. If the accounts were
>    deliberately cleaned up, anything recreated may be cleaned up again, and the
>    suite breaks a third time.
>
> ### What stays true regardless of approach
>
> These are findings, not plan steps, and they survive the park:
>
> - **1.8's owner-side half passes vacuously** whenever Org A is empty —
>   `for (const row of rows)` over an empty array asserts nothing. Any fixture
>   design must give Org A real rows, and the spec needs a
>   `rows.length > 0` guard so it can never silently do this again.
> - **`tests/README.md`'s stated fix is wrong.** It says set `plan_type`; the gate
>   is `has_active_subscription()`, reading `stripe_subscriptions` OR an
>   owner-email allowlist. Correct that whenever the README is next touched.
> - **`CLIENT` is not an auth user.** It is a `client_portal_users` row with its
>   own `password_hash`, so its `invalid_credentials` from `/auth/v1/token` says
>   nothing about whether the portal account works. Any portal fixture must be
>   created through the app's own hashing path, not a raw insert.
> - **1.9's marker is runtime-fetched, not in the repo** — the problem is that
>   `limit=1` has no `.order()`, so it is arbitrary and unstable between runs.
>
> ### Cost of leaving it parked
>
> The entire `tests/` QA suite stays unrunnable, including the only cross-tenant
> isolation coverage. Everything on the `loyalty-tiers-only` branch has been
> verified by typecheck, lint, and direct `tsx` execution — **nothing has been
> exercised in a browser.** That is the standing risk this park accepts.

---

**Original status:** planning only. Nothing was created.
**Why:** all three fixture accounts in `tests/fixtures.ts` fail against the Auth REST API (`invalid_credentials`, verified 2026-07-29), so the entire `tests/` QA suite is unrunnable — including `cross-org-isolation.spec.ts`, the only cross-tenant coverage.

**Decisions taken by the owner (2026-07-29):**
1. Org A is **non-trial**. Nine booking/customer tests beat one paywall assertion. The trial-blocks-customer-insert assertion is knowingly lost and must be noted in `tests/README.md`.
2. The client fixture is a **dedicated throwaway customer inside TIDYWISE (Org B)**, and that same row is the cross-org leak marker. Synthetic, but genuinely in Org B, so a leak still surfaces it.
3. The owner fixture must belong to **Org A only**.
4. Add/delete/reorder tiers stays out of scope (unrelated; noted for context).

---

## Four corrections before anything is built

### 1. It is 2 auth users, not 3

`CLIENT` is not a Supabase Auth user. The client portal uses a custom `client_portal_users` table (`password_hash`, `username`, `customer_id`, `organization_id`) — there is no `auth.users` row behind it. That is also why `bdemandingo+client@gmail.com` returning `invalid_credentials` from `/auth/v1/token` is *expected* and tells us nothing about whether the portal account works.

So the real inventory is **2 auth users + 1 portal user + 2 customer rows**, not three auth users.

### 2. The false-pass mechanism is emptiness, not dual membership

The instinct is right — there **is** a false pass on the only cross-tenant coverage — but the cause is different, and it matters because the fix is different.

`cross-org-isolation.spec.ts:22-25`:

```ts
const rows = (await resp.json()) as Array<{ organization_id: string }>;
for (const row of rows) {
  expect(row.organization_id, `${table} row leaked into owner's cross-org read`).not.toBe(STAFF.orgId);
}
```

**If Org A has zero rows, the loop body never executes and the test passes having asserted nothing.** Org A ("hu") has zero customers and zero bookings — so 1.8's entire owner-side half has been passing vacuously all along, for `customers`, `bookings`, and `invoices`.

Dual membership would do the *opposite*: an owner in both orgs would see Org B rows and the assertion would **fail loudly**. Same for 1.9's direct-ID probe at `:49-56` — a dual member would get the row back and `toEqual([])` would fail.

Single-org membership is still worth enforcing (it is what the test *means*, and it protects the staff direction too) — but it is hygiene, not the false-pass fix. **The false-pass fix is giving Org A real rows plus a non-empty guard**, both below.

### 3. 1.9's marker is already runtime-fetched — but it is arbitrary

The concern about a real customer's email landing in the repo is already handled for the marker. `cross-org-isolation.spec.ts:86-88` deliberately avoids hardcoding, and fetches at runtime:

```ts
const orgBResp = await request.get(`${SUPABASE_URL}/rest/v1/customers?select=email&limit=1`, {...});
expect(orgBCustomer?.email, "Org B has no customers to use as a leak marker — can't run this check").toBeTruthy();
```

The real problem is `limit=1` with no ordering: it grabs **whatever arbitrary Org B customer comes back**, which on a live org is very likely an actual paying customer. The test then searches the admin UI for that person's email.

So the improvement is not "stop putting it in the repo" (it already isn't) — it is **pin the marker to the known synthetic row** instead of taking an arbitrary real one. That also removes a `.range()`-style non-determinism: `limit=1` without `.order()` can return a different customer between runs.

The hardcoded email that *is* in the repo is `CLIENT.email` in `fixtures.ts` — the user's own `+client` alias, not a third party. Replacing it with a synthetic address is still the right call.

### 4. The README's suggested fix for the paywall gate is wrong

`tests/README.md` says: *"Fix: give that org an active subscription (`plan_type` other than `"trial"`)"*. `plan_type` is not what the gate reads.

`has_active_subscription()` (`20260531074347:2-34`) is:

```sql
EXISTS (SELECT 1 FROM public.stripe_subscriptions s
        WHERE s.organization_id = _org_id
          AND s.status IN ('active','trialing','past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
OR
EXISTS (SELECT 1 FROM public.organizations o
        JOIN auth.users u ON u.id = o.owner_id
        WHERE o.id = _org_id
          AND (u.email IN ('support@tidywisecleaning.com','applereview@tidywise.com',
                           'info@openarmscleaning.com','applereview@tidywise1.com')
               OR u.email LIKE '%@tidywise1.com'));
```

Two ways in, and **the second is much cleaner for a test fixture**: an owner whose email ends in `@tidywise1.com` passes the gate with no billing artifacts at all.

Note the existing owner `support+paywalltest2@tidywisecleaning.com` is *not* on the allowlist (that entry is `support@tidywisecleaning.com`, no `+` alias), which is exactly why "hu" is gated — consistent with the README's live finding.

**Recommended: use the `@tidywise1.com` owner-email bypass. Do NOT fabricate a `stripe_subscriptions` row.** A fake `status='active'` row makes the database claim a Stripe subscription that does not exist upstream, which `stripe-analytics-sync`, `reconcile-checkout-session`, and `stripe-isolation-audit` may pick up, report on, or try to reconcile. That is a real blast radius for a test fixture.

**Trade-off to accept knowingly:** this couples the fixture to a production allowlist. If that allowlist is ever tightened, the fixture silently re-gates and 3.1–3.9 start skipping again. Mitigation is a `beforeAll` assertion that `has_active_subscription` is true for Org A, so the failure is loud rather than a silent skip.

---

## Phase 0 — Discovery. Nothing is created.

Everything downstream branches on this. Run in Lovable:

```sql
-- Do the auth users still exist, and what state are they in?
select id, email, created_at, last_sign_in_at, email_confirmed_at,
       banned_until, deleted_at
from auth.users
where email in (
  'support+paywalltest2@tidywisecleaning.com',
  'bdemandingo+staff@gmail.com'
);

-- Which orgs does each belong to, and in what role? (the single-org check)
select u.email, om.organization_id, o.name, om.role
from auth.users u
join public.org_memberships om on om.user_id = u.id
left join public.organizations o on o.id = om.organization_id
where u.email in (
  'support+paywalltest2@tidywisecleaning.com',
  'bdemandingo+staff@gmail.com'
)
order by u.email, o.name;

-- Org A and Org B as they stand
select id, name, owner_id, slug from public.organizations
where id in ('0f329006-ac99-46b1-83d1-632c6a1bb355',
             'e95b92d0-7099-408e-a773-e4407b34f8b4');

-- Does Org A currently pass the gate? (expect false)
select public.has_active_subscription('0f329006-ac99-46b1-83d1-632c6a1bb355') as org_a_gate,
       public.has_active_subscription('e95b92d0-7099-408e-a773-e4407b34f8b4') as org_b_gate;

-- How empty is Org A? (this is the 1.8 vacuity)
select 'customers' as t, count(*) from public.customers where organization_id='0f329006-ac99-46b1-83d1-632c6a1bb355'
union all select 'bookings', count(*) from public.bookings where organization_id='0f329006-ac99-46b1-83d1-632c6a1bb355'
union all select 'invoices', count(*) from public.invoices where organization_id='0f329006-ac99-46b1-83d1-632c6a1bb355';

-- Does the existing client portal account still exist?
select cpu.id, cpu.username, cpu.is_active, cpu.customer_id, cpu.organization_id,
       c.email, c.first_name, c.last_name
from public.client_portal_users cpu
join public.customers c on c.id = cpu.customer_id
where c.email = 'bdemandingo+client@gmail.com';
```

**Decision points from the output:**

| Finding | Action |
|---|---|
| Owner auth user exists, single-org | Reset its password. **Do not create an org or a user.** |
| Owner auth user exists, in 2+ orgs | Remove the extra membership, or create a fresh owner. Decide with the owner. |
| Owner auth user gone | Create one — and only then does a new auth user land in production. |
| Org A gate already true | Skip Phase 1 entirely. |
| Portal account exists and is active | Keep it, but still add the synthetic marker customer (Phase 4). |

---

## Phase 1 — Make Org A pass the subscription gate

**Do not create a new org.** Reuse `0f329006…` ("hu"). It already exists, is already referenced in the README and `fixtures.ts`, and has no real data to endanger.

Route: change Org A's `owner_id` to an auth user whose email ends `@tidywise1.com`, satisfying the allowlist branch.

This depends on an open question — see "Open questions" below. If `@tidywise1.com` is not usable, the fallback is adding Org A's owner email to the explicit `IN (...)` list, which is a **migration to a security-relevant function** and needs its own review.

Verify after: `select public.has_active_subscription('0f329006-…')` → `true`.

## Phase 2 — Owner auth user, Org A only

- Email: `qa+orga-owner@tidywise1.com` (satisfies the gate, obviously synthetic, distinct from any human)
- Must appear in `org_memberships` for Org A **and no other org**, role `owner`
- Must be `organizations.owner_id` for Org A

Verify: the Phase 0 membership query returns exactly one row for this user.

## Phase 3 — Staff auth user, Org B only

- Prefer resetting `bdemandingo+staff@gmail.com` if it exists — no new user
- Must be in `org_memberships` for Org B (TIDYWISE) **and no other org**
- `STAFF.staffId` in `fixtures.ts` (`4ec567a3-…`) must still resolve to a live `staff` row; confirm in Phase 0 or correct it

## Phase 4 — The synthetic marker customer, in Org B

One `customers` row inside TIDYWISE:

| Field | Value |
|---|---|
| `organization_id` | `e95b92d0-7099-408e-a773-e4407b34f8b4` (Org B) |
| `first_name` / `last_name` | `QA-TEST-DELETE` / `Marker` |
| `email` | `qa+orgb-marker@tidywise1.com` |
| `phone` | leave null — a null phone is what keeps `send-staff-password-reset` from ever delivering (see the README safety note) |

This row serves **both** purposes: the portal fixture's customer, and 1.9's pinned leak marker. It is synthetic but genuinely in Org B, so a real isolation failure still surfaces it.

**Naming matters:** `QA-TEST-DELETE` is the convention the suite already uses for self-cleanup, so this row is greppable and obviously disposable to anyone looking at TIDYWISE's customer list.

## Phase 5 — Portal user for that customer

One `client_portal_users` row: `customer_id` → the Phase 4 row, `organization_id` → Org B, `is_active` true, `must_change_password` false, a known password.

**Not an auth user.** The password must be hashed the same way `client-portal-login` verifies it — do not hand-write a hash. Have Lovable create it through whatever path the app itself uses (`admin-reset-portal-password` or equivalent) rather than a raw insert, or the account will exist and never authenticate.

## Phase 6 — Seed one customer into Org A

This is the actual fix for the 1.8 vacuity. One `QA-TEST-DELETE` customer in Org A, so the owner-side loops iterate real rows instead of an empty array.

| Field | Value |
|---|---|
| `organization_id` | `0f329006-…` (Org A) |
| `first_name` / `last_name` | `QA-TEST-DELETE` / `OrgA` |
| `email` | `qa+orga-customer@tidywise1.com` |

Requires Phase 1 (the gate) unless inserted via service role.

## Phase 7 — Code changes (Claude Code, after the data lands)

1. **`tests/fixtures.ts`** — update `OWNER`, `STAFF`, add `CLIENT.customerId` and the marker email as exported constants.
2. **`tests/cross-org-isolation.spec.ts`** — pin 1.9's marker to the synthetic row instead of `limit=1`, so it never picks a real customer and never varies between runs.
3. **`tests/cross-org-isolation.spec.ts`** — add the non-empty guard that closes the vacuous pass:

```ts
expect(rows.length, `Org A has no ${table} rows — this check would pass without asserting anything`).toBeGreaterThan(0);
```

4. **`tests/README.md`** — three edits:
   - Record that **the trial-blocks-customer-insert assertion is deliberately lost** (owner's decision), and that the paywall should be probed separately rather than by keeping a whole fixture org on trial.
   - Correct the "`plan_type` other than trial" fix to name `has_active_subscription` and its two real branches.
   - Note that Org A is non-trial via the `@tidywise1.com` allowlist, and that a tightened allowlist would re-gate it.

---

## What gets created, in total

| # | Object | Where | New? |
|---|---|---|---|
| 1 | Owner auth user `qa+orga-owner@tidywise1.com` | `auth.users` | **only if** Phase 0 shows the existing one is gone |
| 2 | Staff auth user | `auth.users` | **only if** `bdemandingo+staff@gmail.com` is gone; prefer a password reset |
| 3 | Marker customer `QA-TEST-DELETE Marker` | `customers`, **Org B (TIDYWISE)** | yes |
| 4 | Portal user for #3 | `client_portal_users`, Org B | yes |
| 5 | Seed customer `QA-TEST-DELETE OrgA` | `customers`, **Org A ("hu")** | yes |
| — | Org A | — | **no — reuse `0f329006…`** |
| — | Org B | — | **no — TIDYWISE, untouched except #3/#4** |
| — | `stripe_subscriptions` row | — | **no — deliberately avoided** |

Best case (both auth users still exist): **three new rows, no new auth users, no new org.**

## Open questions — need answers before Phase 1

1. **Is `@tidywise1.com` a domain you control?** The whole Phase 1 approach rests on it. If mail delivery isn't needed, an unconfirmed auth user may be enough — but that depends on whether the project requires email confirmation, which Phase 0 shows via `email_confirmed_at`.
2. **Why did the existing credentials stop working?** If the accounts were deliberately cleaned up, recreating them may get cleaned up again. If a password rotation, a reset is enough. Phase 0's `last_sign_in_at` / `deleted_at` / `banned_until` should say.
3. **Is adding two `QA-TEST-DELETE` customers to TIDYWISE acceptable?** They will appear in the real customer list, counts, and possibly reports for your own business. One is unavoidable for the marker to be meaningful.

## Risks

- **Touches production.** TIDYWISE is a live business; Phases 4–5 add rows to it.
- **Fixture couples to a security allowlist** (Phase 1) — mitigate with the loud `beforeAll` gate assertion.
- **The portal password hash** is the most likely thing to get wrong; a raw insert produces an account that exists but cannot log in.
- **`QA-TEST-DELETE` rows in a real org** could be swept by a future cleanup script, silently re-breaking the suite.

---

## Appendix — leftover QA-TEST-DELETE data (cleanup requested 2026-07-29)

The cleanup surface is **wider than customers**. `e2e/signup-onboarding.spec.ts:5-11`
states it outright:

> "This test creates one real account + organization (Supabase Auth has no 'dry
> run' mode) … This account is NOT cleaned up automatically — the test session
> running this suite has no database write/service-role access."

So every run of that spec leaks an `auth.users` row **and an `organizations` row**,
plus whatever the 6-step onboarding persists on submit. Identifiers are
timestamped (`RUN_ID = Date.now()`), so they are pattern-matchable but not
predictable.

Known synthetic identifiers across the suites:

| Source | Leaves behind |
|---|---|
| `e2e/signup-onboarding.spec.ts:22-24` | auth user `bdemandingo+e2eonboarding<ts>@gmail.com`, org `QA-TEST-DELETE E2E Onboarding <ts>` |
| `tests/booking-ui.spec.ts:16` | customer `bdemandingo+qabookingfixture@gmail.com` |
| `tests/booking-ui.spec.ts:138,256` / `e2e/admin-bookings.spec.ts:105` | cancelled bookings with `QA-TEST-DELETE` cancel reasons |
| `tests/security.spec.ts:159` | deletion-request row `QA-TEST-DELETE Regression Probe` / `bdemandingo+qaprobe@gmail.com` |

### Step 1 — DISCOVERY (read-only, run this first)

Deleting an organization cascades widely, so see the list before removing
anything.

```sql
-- Synthetic orgs
select id, name, owner_id, created_at
from public.organizations
where name ilike 'QA-TEST-DELETE%'
order by created_at;

-- Synthetic auth users
select id, email, created_at, last_sign_in_at
from auth.users
where email ilike 'bdemandingo+e2eonboarding%@gmail.com'
   or email ilike 'bdemandingo+qa%@gmail.com'
order by created_at;

-- Synthetic customers, and WHICH org each sits in
select c.id, c.first_name, c.last_name, c.email, c.organization_id, o.name as org, c.created_at
from public.customers c
left join public.organizations o on o.id = c.organization_id
where c.first_name ilike 'QA-TEST-DELETE%'
   or c.last_name  ilike 'QA-TEST-DELETE%'
   or c.email ilike 'bdemandingo+qa%'
order by c.created_at;

-- Bookings tagged by the suites
select b.id, b.organization_id, o.name as org, b.status, b.cancellation_reason, b.created_at
from public.bookings b
left join public.organizations o on o.id = b.organization_id
where b.cancellation_reason ilike '%QA-TEST-DELETE%'
order by b.created_at;

-- What a QA org deletion would cascade into (run per org id found above)
select 'customers' as t, count(*) from public.customers where organization_id = '<QA_ORG_ID>'
union all select 'bookings',        count(*) from public.bookings        where organization_id = '<QA_ORG_ID>'
union all select 'org_memberships', count(*) from public.org_memberships where organization_id = '<QA_ORG_ID>';
```

### Step 2 — DELETION (only after reviewing Step 1)

**Check every id against the discovery output before running.** Do not
pattern-delete organizations blind — a real business with an unlucky name would
cascade away.

Order matters: bookings → customers → memberships → org → auth user.

```sql
-- Cancelled test bookings (safe: identified by their own cancel reason)
delete from public.bookings where cancellation_reason ilike '%QA-TEST-DELETE%';

-- Synthetic customers, by explicit id list from Step 1
delete from public.customers where id in ('<id>', '<id>');

-- Synthetic orgs, by explicit id list from Step 1 (cascades)
delete from public.organizations where id in ('<id>', '<id>');

-- Synthetic auth users, by explicit id list from Step 1
-- Prefer the Supabase admin API / dashboard over a raw delete from auth.users.
```

### Fix the leak, not just the spill

Cleaning up is a one-off; the spec will leak again on its next run.
`e2e/signup-onboarding.spec.ts` needs either a service-role teardown, or to be
marked `test.skip` by default and run deliberately. Otherwise this appendix gets
written again in three months.
