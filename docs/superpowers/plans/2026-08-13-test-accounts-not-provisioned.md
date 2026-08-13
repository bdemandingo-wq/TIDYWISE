# Cross-org isolation: from 2 meaningful passes to 10

*Originally titled "still unverified: the QA accounts share one org". Retitled once it was verified — the history below is kept because the failure modes are the useful part.*

**Logged:** 2026-08-13, immediately after restoring the test credentials.
**Status:** Verified. Org B provisioned and seeded. **10 of 13 tests genuinely meaningful, up from 2.** One known gap (client portal, test 12) and one partial (test 11) remain — see Outstanding.
**Related:** `2026-08-13-dead-test-credentials.md` (the credential half of the same problem)

## Run 1 — restoring credentials was necessary but not sufficient

With working owner and staff logins, `cross-org-isolation.spec.ts` reported **9 passed, 2 failed, 1 skipped**. Only **two** of those nine passes meant anything.

```
OWNER  org_memberships → d14b42bd-0331-4197-9806-b35df399a647  "test account 1"  role owner
STAFF  org_memberships → d14b42bd-0331-4197-9806-b35df399a647  "test account 1"  role member
```

Both accounts are in the same organisation. The spec exists to prove Org A cannot see Org B. **There is no Org B.** Tests asserting "Org A's list contains no Org B row" were not merely passing on thin data — they were structurally incapable of detecting the leak they are named for. Both tokens also saw zero rows in `customers`, `bookings` and `invoices`, so there was no leak marker to look for either.

These are new accounts rather than reset passwords — auth user ids `d56c62af…` (owner) and `308da0d2…` (staff), versus `6e7eb2fd…` and `14ab78cf…` in the storageState from 2026-07-15.

### Which passes were real

| Test | Verdict |
|---|---|
| owner REST list of customers / bookings / invoices has no Org B row | hollow — no Org B, no rows |
| staff REST list has no Org A row | hollow — same |
| staff REST access to a financial table is scoped by RLS | hollow — no rows |
| owner direct-ID GET of an "Org B" org row | weak — queried a stale hardcoded org the account cannot read |
| staff direct-ID GET of an "Org A" customer | weak — same |
| **staff hitting `/dashboard` is redirected to `/staff`** | **genuine** — the account really holds `role: member` |
| **staff hitting an owner-only Finance route is redirected** | **genuine** — same |

## The best-written test in the file is the one that failed

Test 7 did not fail an assertion about the app. It failed its own precondition:

```
Error: Org B has no customers to use as a leak marker — can't run this check
```

It is the only test in the file that checked whether it *could* do its job. Its own comment explains why it was written that way: the original version *"only proved isolation by coincidence (any row at all would have been a leak), not by actually looking for one."* That guard is the sole reason we know the other seven were hollow rather than reassuring.

## Fixed: org IDs are derived, not hardcoded

`fixtures.ts` hardcoded `OWNER.orgId = 0f329006…` ("hu") and `STAFF.orgId = e95b92d0…` (TIDYWISE). Neither matched the live accounts, so two tests were querying orgs those accounts had no relationship to — and passing because the read came back empty.

Same drift class as the password that lived in six files: a constant describing live state, with nothing keeping it true.

`tests/global-setup.ts` now derives it. After each login it lifts the access token out of the session, reads `org_memberships`, and writes `tests/.auth/{owner,staff}-org.json` with `organizationId`, `role`, and a best-effort `staffId`. `fixtures.ts` reads those through lazy getters that throw with instructions if setup has not run.

Two properties worth keeping:

1. **Setup fails if an account has no `org_memberships` row.** An unseated account reads nothing, which makes every isolation test pass vacuously — so that is caught where it is legible rather than downstream.
2. **The getters are lazy.** `security.spec.ts` builds its `SUSPECTED_GAPS` array at collection time and reads `OWNER.orgId` there; an eager throw would fail the whole file to load, including its anon-only tests. Its `body` fields are now thunks so the read happens inside each test.

### The derivation immediately converted two false passes into honest failures

Tests 6 and 7 previously passed because the stale hardcoded ID pointed at an org the account could not read, so the response was empty. With the real derived ID they now correctly fail — the owner *can* read its own org row, and the test is asserting it cannot read Org B's. They will be meaningful again once the accounts are in separate orgs.

Score went from a misleading **9 passed / 2 failed** to an honest **7 passed / 5 failed / 1 skipped**, with failures that name the actual problem.

## Fixed: the suite can no longer go green without a second org

`cross-org-isolation.spec.ts` now opens with a precondition test asserting that `OWNER.orgId !== STAFF.orgId` **and** that Org B has at least one customer to serve as a leak marker. Verified firing:

```
Error: the owner and staff accounts are both in org d14b42bd-…. There is no Org B,
so nothing in this file can detect a cross-org leak — every assertion below would
pass vacuously. Seat them in separate orgs.
```

A cross-org suite that cannot see a second org must fail loudly, not go green.

## Resolved: how it went from 2 genuine passes to 10

Across four runs Playwright's pass count moved by three. The number of passes that
*proved something* went up five-fold. That gap is the whole point of this document.

| Run | State | Reported | **Genuinely meaningful** |
|---|---|---|---|
| 1 | Both accounts in one org, no data | 9 passed / 2 failed / 1 skipped | **2** |
| 2 | Org B created, orgs distinct; row-count guards added | 9 passed / 3 failed / 1 skipped | **6** |
| 3 | Booking in Org B assigned to the staff member | 11 passed / 2 failed | **9** |
| 4 | Invoice seeded in Org A | **12 passed / 1 failed** | **10** |

Playwright's count went 9 -> 9 -> 11 -> 12. Meaning went 2 -> 6 -> 10. **The gap
between those two sequences is the finding worth keeping.** A reported pass count
tracked the work being done almost not at all; what tracked it was whether each
assertion could still fail.

Run 2 is the clearest case: adding the row-count guards made the reported count
*worse* and the suite trustworthy, because two hollow filter-checks flipped from
green to red with messages naming the exact seed they needed.

Final state, per test:

| # | Test | Result | Meaningful |
|---|---|---|---|
| 1 | PRECONDITION: distinct orgs + marker | pass | yes — marker is **strong** |
| 2 | owner list of customers has no Org B row | pass | yes |
| 3 | owner list of bookings has no Org B row | pass | yes |
| 4 | owner list of invoices has no Org B row | pass | yes — 2 invoices in Org A, filter ran |
| 5 | staff list has no Org A row | pass | yes |
| 6 | owner direct-ID GET of Org B org row | pass | yes |
| 7 | staff direct-ID GET of Org A org row | pass | yes |
| 8 | owner UI shows no Org B marker | pass | yes — real customer email |
| 9 | staff `/dashboard` → `/staff` | pass | yes |
| 10 | staff Finance route redirected | pass | yes |
| 11 | staff reading `manual_payments` → empty | pass | partial — see below |
| 12 | client portal dashboard isolation | **fail** | **known gap** — see Outstanding |
| 13 | anon REST read of bookings → zero rows | pass | yes |

The cross-org boundary is now genuinely exercised in both directions: list reads
filtered with real rows on both sides, direct-ID lookups of a genuinely foreign
org masked to an empty body rather than the record, role separation enforced for a
real `member` account, and bare anon reads of `bookings` blocked. First honest
verification of this suite since 2026-07-15.

Each pass was confirmed by probing the tokens directly rather than trusting the
green tick — both sides must hold real rows for a filter-check to have iterated:

```
OWNER (Org A e4d60558)  customers: 1  bookings: 1  invoices: 2   all org_id = e4d60558
STAFF (Org B d14b42bd)  customers: 1  bookings: 1               all org_id = d14b42bd
```

## The non-obvious requirement: a customer is not enough, it needs a booking

Adding a customer to Org B did **not** give the staff account a leak marker, and
that cost a full round trip. `staff_can_view_customer`
(`20260122200613_*.sql:12-28`) grants a staff member visibility only *through a
booking*:

```sql
FROM public.staff s
JOIN public.bookings b ON b.organization_id = _org_id AND b.customer_id = _customer_id
WHERE s.user_id = auth.uid() AND s.is_active = true
  AND ( b.staff_id = s.id
        OR EXISTS (SELECT 1 FROM booking_team_assignments bta
                   WHERE bta.booking_id = b.id AND bta.staff_id = s.id) )
```

So a `member`-role account in an org full of customers can legitimately see
**none** of them. Correct least-privilege design, and it means:

- **Seeding a customer in Org B is insufficient.** It needs a booking whose
  `staff_id` is that staff member's `public.staff.id` (or a
  `booking_team_assignments` row).
- **The strong marker depends on that assignment.** Without it the precondition
  falls back to the org name, which would never have appeared in a customer list
  anyway — so test 8 passes while proving nothing. The fallback is deliberately
  logged as `WEAK MARKER` rather than hidden.
- **Verify a seed landed by asking the token, not the UI.** `staff bookings: 1
  row, staff_id=a1aa8f00…` is what confirmed it; the app showing a booking would
  not have.

## Correction: test 13 was never blocked on the client account

I recorded tests 12 and 13 as both needing a client portal login. **Only 12
does.** Test 13 uses the staff token purely as a baseline and then asserts the
bare **anon** key reads zero rows from `bookings`, guarding a policy hole removed
in `20260413170000`. It carried its own `test.skip(staffVisibleBookings.length === 0)`
— which is why it skipped rather than passing vacuously, the same guard pattern,
already there before any of today's work. It runs and passes now that Org B has a
booking.

Worth noting because I assumed a shared cause from two adjacent failures in the
same `describe` block, rather than reading what each test actually did.

## Outstanding

1. ~~An invoice in Org A~~ — **done** (run 4). Two earlier attempts had not shown
   up to the owner token, and the cause was worth recording: `.env.test` pointed at
   `support+qa2@tidywisecleaning.com` while the invoice was being created as
   `support+qa@` — two different accounts, not two orgs behind one email. The
   apparent mid-session auth-id change (`d56c62af…` → `cb627101…`) was the owner
   *email* in `.env.test` changing, not an account being recreated.
   **Verify a seed landed by asking the token, not by looking at the app**, and
   treat `tests/.auth/owner-org.json` as authoritative on which org the test owner
   is in.
2. **Test 12 is a KNOWN UNTESTED GAP, not assumed covered.** Creating a client
   portal account requires payment, so the client-portal *UI* isolation boundary
   has never been exercised. That is the same surface as follow-up item 8, where
   ten `SECURITY DEFINER` RPCs were found anon-callable with no ownership check —
   so it is the last place to assume coverage. Record it as untested wherever
   client-portal security is claimed.
3. **Optional, upgrades test 11 from partial to proof**: seed one
   `manual_payments` row in Org B. The test asserts a `member` reads zero rows
   there, but cannot currently distinguish "RLS blocked the member" from "the
   table is empty for this org". A row makes the empty read meaningful.
4. Re-run `--project=setup` after any account change, so the derived org context
   is refreshed.

## The recurring pattern, stated once

Three separate times in two days, a green test proved nothing: the schema probe that read a missing table as success, the token-vocabulary test that passed because *nothing* was registered, and now an entire cross-org suite passing with no second org. Each was caught by adding a control that fails when the test cannot do its job — a fake column, a resolved token, a distinct second org. **A test that cannot fail is not evidence, and the cheapest guard is one assertion proving the test's own premise holds.**
