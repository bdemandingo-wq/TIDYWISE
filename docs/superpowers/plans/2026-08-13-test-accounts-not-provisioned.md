# Cross-org isolation is still unverified: the QA accounts share one org

**Logged:** 2026-08-13, immediately after restoring the test credentials.
**Status:** Plumbing fixed. **Provisioning outstanding — owner to create Org B and a customer in it.**
**Related:** `2026-08-13-dead-test-credentials.md` (the credential half of the same problem)

## Restoring credentials was necessary but not sufficient

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

## Outstanding — needs real data, so it is the owner's call

1. **Create Org B** and move the staff account into it, so owner and staff are genuinely in different orgs.
2. **Add at least one customer to Org B** — the leak marker the tests search for in Org A's results.
3. **A client portal account** remains blocked: creating one requires payment, so tests 12 and 13 stay unrunnable. Both are client-portal isolation checks, so that boundary is untested for now and should be noted as a known gap rather than assumed covered.
4. Re-run `--project=setup` after any account change, so the derived org context is refreshed.

Once 1 and 2 are done, the precondition passes and the seven hollow tests become real probes for the first time since the accounts were recreated.

## The recurring pattern, stated once

Three separate times in two days, a green test proved nothing: the schema probe that read a missing table as success, the token-vocabulary test that passed because *nothing* was registered, and now an entire cross-org suite passing with no second org. Each was caught by adding a control that fails when the test cannot do its job — a fake column, a resolved token, a distinct second org. **A test that cannot fail is not evidence, and the cheapest guard is one assertion proving the test's own premise holds.**
