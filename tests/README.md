# QA regression suite (tests/)

Built from `TidyWise-QA-Checklist.xlsx`. Targets the **live production
site** (`https://www.jointidywise.com`) — read-only by default. Separate
from `e2e/` (the existing dev-server critical-flow harness, which stays as
is).

## Run it

```bash
npm run test:qa            # runs setup (logs in 3 roles) + the full suite
npm run test:qa:setup      # re-run only if a saved session goes stale
npm run test:qa:report     # open the last HTML report
```

Or directly:

```bash
npx playwright test -c playwright.qa.config.ts
npx playwright test -c playwright.qa.config.ts --project=setup
npx playwright show-report qa-report
```

Sessions are cached in `tests/.auth/*.json` (gitignored) after the first
`setup` run, so subsequent runs don't re-login per test.

## Files

| File | Checklist IDs |
|---|---|
| `global-setup.ts` | — (auth fixtures) |
| `auth-session.spec.ts` | 1.2, 1.3, 1.4, 1.7 |
| `cross-org-isolation.spec.ts` | 1.8, 1.9, 1.10, 1.11 |
| `booking-ui.spec.ts` | 3.1, 3.2, 3.4, 3.6, 3.9 |
| `responsive.spec.ts` | 8.1, 8.4, 8.5, 8.6 |
| `accessibility.spec.ts` | 9.1, 9.2, 9.3, 9.4 |
| `seo-static.spec.ts` | 12.1, 12.4 |
| `security.spec.ts` | 13.2, 13.5, + 8 spoofed-value regression checks |
| `NEEDS_ANOTHER_TOOL.md` | everything explicitly out of Playwright's scope |

## Known, currently-blocking finding (read before triaging red tests)

**The owner QA org (`0f329006-ac99-46b1-83d1-632c6a1bb355`, "hu", trial
plan) has zero customers, and the RLS policy "Require active subscription
to insert customers" blocks creating one** (confirmed live 2026-07-14 —
`POST /rest/v1/customers` → `403 42501`). The admin "New Booking" dialog
requires an existing customer as its first step, so **3.1, 3.2, 3.4, 3.6,
3.9, and the admin half of 9.1 cannot run to completion** — this is the
same root cause already flagged in `e2e/admin-bookings.spec.ts` and maps
directly to checklist item **16.2**. Fix: give that org an active
subscription (`plan_type` other than `"trial"`) or seed one
`QA-TEST-DELETE` customer via service role/Lovable. The affected tests
self-detect this via a live `beforeAll` check and `test.skip()` with a
clear reason — no code changes needed once unblocked.

## Two real, distinct orgs used for cross-org tests

Discovered live, not seeded by this suite:
- **Org A** — `0f329006-ac99-46b1-83d1-632c6a1bb355` ("hu", trial) — the
  owner test account's org.
- **Org B** — `e95b92d0-7099-408e-a773-e4407b34f8b4` ("TIDYWISE",
  lifetime, real seeded data) — the staff and client test accounts' org.

`cross-org-isolation.spec.ts` uses this real pair rather than two
throwaway orgs, which is what makes it a genuine isolation probe.

## Re-verifying the org_memberships owner-protection trigger live

`security.spec.ts` only source-guards this (reading the migration file) —
it does not perform a live privilege-escalation attempt, because that
requires standing up a disposable org + inviting a manager into it, which
is too heavy/risky for a routine run against production. If a deeper live
check is ever needed again, the pattern used the one time this was
verified (2026-07-10):
1. Create a throwaway org as a fresh signup.
2. Use `send-team-invite` → extract `accept_url`'s token from the JSON
   response directly (don't rely on email delivery).
3. `accept-team-invite` with `mode: "signup"` to add a second account as
   `manager`.
4. As the manager, attempt to `DELETE`/`UPDATE` the owner's
   `org_memberships` row → expect a Postgres exception
   `cannot_remove_last_owner`.
5. Tear down the throwaway org.

## Safety notes specific to this suite

- `security.spec.ts`'s "8 spoofed-value checks" call real edge functions
  with real (test-account) auth. Each was chosen to be safe to run
  repeatedly: no real charges, no email/SMS sent to anyone outside the
  approved test addresses, and the one function that DOES send SMS on
  success (`send-staff-password-reset`) fails closed to "No phone number
  on file" for the test staff account (no phone on file), so it never
  actually delivers.
- `13.2`'s "suspected gaps" list calls 12 edge functions with placeholder/
  garbage IDs specifically so any that ARE still open fail fast on a
  lookup rather than doing real work (e.g. a garbage `bookingId` 404s
  before any SMS send code is reached).
