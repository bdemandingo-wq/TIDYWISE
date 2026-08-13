# HIGH — every test credential is dead, so nothing authenticated has been running

**Logged:** 2026-08-13, while trying to run a new e2e spec.
**Status:** Not fixed. **Blocks all authenticated testing in both suites.**
**Severity:** High. This is not a broken test — it is the loss of a whole class of verification, including the one guard written specifically to catch cross-tenant data leaks.

## The finding

All three shared test accounts return `400 invalid_credentials` from Supabase auth, verified directly against `/auth/v1/token?grant_type=password` rather than inferred from a test failure:

| Account | Result |
|---|---|
| `support+paywalltest2@tidywisecleaning.com` (OWNER) | `400 invalid_credentials` |
| `bdemandingo+staff@gmail.com` (STAFF) | `400 invalid_credentials` |
| `bdemandingo+client@gmail.com` (CLIENT) | `400 invalid_credentials` |

Whether the passwords were rotated or the accounts were deleted is unknown from here. All three failing together points at a deliberate change rather than drift.

## What is actually dark

Running the QA setup project gives `3 failed`, and its dependents report **`13 did not run`**. They are not silently passing — but "did not run" reads as benign in a summary line, and nobody was reading past the summary.

**QA suite — 7 of 14 specs cannot run:**

- `cross-org-isolation.spec.ts` ← **the worst one.** This exists specifically to catch multi-tenant leaks, per CLAUDE.md. It has been dark.
- `accessibility.spec.ts`
- `auth-session.spec.ts`
- `booking-ui.spec.ts`
- `logout-check.spec.ts`
- `portal-loyalty-no-redeem.spec.ts`
- `responsive.spec.ts`

**e2e suite — 5 of 7 specs cannot run:** `admin-bookings`, `admin-payments`, `login`, `signup-onboarding`, and the new `sidebar-pinned-help`.

**Still genuinely running** (anon key only, no login): `security.spec.ts`, `seo-static.spec.ts`, the four Facebook-lead contract/unit specs, `speed-to-lead.contract.spec.ts`, `pricing-back-flow`, `pricing-plans`. Every "N passed" reported from this repo recently came from these — which is why the contract specs worked all week while nothing authenticated did.

## Timeline

The credential was introduced **2026-07-14** in `e1c127f4` (QA suite) and `cbd472b0` (e2e harness), and neither `tests/global-setup.ts` nor `tests/fixtures.ts` has been touched since. It demonstrably worked then — that suite produced real findings on live data. So the break is somewhere between 2026-07-14 and 2026-08-13, and cannot be narrowed further from the repo.

## Why it broke silently — and the fix

The password is **hardcoded in six files**:

```
tests/fixtures.ts:5
tests/auth-session.spec.ts:5
tests/global-setup.ts:17
tests/logout-check.spec.ts:43
e2e/login.spec.ts:15
e2e/helpers/admin.ts:5
```

Six copies of a secret is the same "things that must agree, agreeing only by memory" shape as the sidebar nav lists and the `KEEP IN SYNC` template pair. It also means rotating the password requires editing six files, which is exactly the friction that leads to nobody rotating it and everybody assuming it still works.

**Decision, 2026-08-13: the replacement credential goes in a local env file, not the repo.** Read it once, from one place:

```ts
// tests/fixtures.ts and e2e/helpers/admin.ts both read this, nothing hardcodes it
const email = process.env.QA_OWNER_EMAIL;
const password = process.env.QA_OWNER_PASSWORD;
if (!email || !password) {
  throw new Error(
    'QA_OWNER_EMAIL / QA_OWNER_PASSWORD not set — copy .env.test.example to ' +
    '.env.test and fill them in. Authenticated tests cannot run without them.'
  );
}
```

Two properties worth keeping in that snippet:

1. **It throws rather than skipping.** A missing credential must be loud. Skipping is how this went unnoticed for a month.
2. **`.env.test` is gitignored, with a committed `.env.test.example`** listing the names and no values, so the requirement is discoverable without the secret being in git.

## Before closing it out

- **Re-run `cross-org-isolation.spec.ts` first**, ahead of any other suite. It has been dark for up to a month across a period that included client-portal RPC lockdowns, the `org_memberships` policy replacement, and the Facebook lead work — all multi-tenant surfaces. A real leak could have appeared and gone unseen.
- Check whether the accounts still exist at all before assuming a password rotation.
- `logout-check.spec.ts` deliberately revokes every session for the shared account (`scope: 'global'`, see `playwright.qa.config.ts:42-54`). If the replacement account is shared with anything else, that will keep biting.
