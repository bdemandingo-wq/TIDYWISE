# Platform Sender Fallback for Owner-Facing Email — Implementation Plan

**Goal:** An internal report to a business owner about their own business must not fail because that org never configured a sending identity. Fall back to the platform sender — and keep the broken org identity visible.

**Status:** Plan written 2026-08-13. Nothing edited.

---

## First, a correction to the brief

The report says payroll goes `payroll-period-report → _shared/payroll-period-process.ts → sendOrgEmail`. **It does not use `sendOrgEmail`.** `payroll-period-process.ts` imports the Resend SDK directly (`:8`) and calls `getOrgEmailSettings` itself (`:24-27`). That is where the "Email settings not configured" string comes from — `get-org-email-settings.ts:53`, not `sendOrgEmail`.

This matters because it changes the fix. Adding a fallback to `sendOrgEmail` alone would not touch payroll at all.

Worse, payroll is the **only** owner-facing sender with no platform-key fallback whatsoever:

```ts
// payroll-period-process.ts:726
const resend = new Resend(emailSettings.resend_api_key);   // no `|| RESEND_API_KEY`
const fromHeader = formatEmailFrom(emailSettings);          // always the org identity
```

Compare `send-org-email.ts:163`, which at least degrades to the platform key:

```ts
const key = settings.resend_api_key || Deno.env.get("RESEND_API_KEY");
```

---

## The three failure buckets, mapped to code

| Reported | Count | Where it fails |
|---|---|---|
| "Email settings not configured" | 22 | `get-org-email-settings.ts:52-56` returns `success: false` when there is no `organization_email_settings` row. Payroll skips as `no_email_settings` before reaching any send. |
| Invalid org-supplied Resend key | 7 | `payroll-period-process.ts:726` constructs the client with the org key. `settings.resend_api_key` wins unconditionally, so a bad key is never retried against the platform key. |
| Unverified `gmail.com` sender domain | 1 | `formatEmailFrom(settings)` (`:728`) puts the org's `from_email` in the header. Resend rejects an unverified domain **regardless of which API key sent it** — so a platform *key* alone does not fix this one. It needs a platform *from*. |

That third row is the reason the fix cannot just be "use the platform key when the org's is missing". Two of the three buckets need a platform **identity**, not merely platform credentials.

---

## Yes — other owner-facing email has the same problem

Surveyed every function that constructs a Resend client or POSTs to the Resend API. Of 26, only three lack a platform-key fallback: `payroll-period-process.ts`, `manage-resend-domain` (legitimately needs the org's own key — it manages that org's domain), and `notify-demo-request`.

But a platform key is not the bar. The bar is *does an owner-facing report survive a missing or broken org identity*, and by that measure two more are broken:

**`weekly-business-report:324` — same bug, different shape.**

```ts
if (emailSettingsResult.success && emailSettingsResult.settings && RESEND_API_KEY) {
  const senderFrom = formatEmailFrom(emailSettingsResult.settings);
```

It has the platform key but still **gates the entire send on the org settings existing**, and still sends from the org identity. So the same 22 orgs get no weekly business report either, silently — there is no `else` branch logging the skip.

**Every `sendOrgEmail` caller, for those same 22 orgs.** `send-org-email.ts:200-213` returns early when settings are missing, before any send path. That is *correct* for customer-facing mail — you should not email a customer as an org with no configured identity — but it is wrong for the owner-facing callers among the 17: `send-admin-booking-notification`, `notify-invoice-paid`, `notify-quote-accepted`, `send-month-end-pnl-reminder`, and the two test-email functions.

**`weekly-payroll-summary` is the one that already works**, and it works by ignoring org identity entirely (`:196-198`): platform key, platform from. It is the model. One caveat — it sends from `noreply@resend.dev`, which is Resend's sandbox domain, not a verified TidyWise sender. Worth checking whether that one is actually delivering or only appearing to.

---

## Design: one pure decision function, opt-in per call site

The sender choice is a decision, and decisions are testable when they are pure. Everything that has gone wrong here is a branch nobody could test because it was welded to `fetch` and `createClient`.

**Create `supabase/functions/_shared/email-sender-resolution.ts`** — zero imports, no Deno globals, so `node:test` can load it directly (same shape as `_shared/facebook-lead-mapping.ts`).

```ts
export type FallbackReason =
  | "org_settings_missing"
  | "org_settings_incomplete"
  | "org_send_failed";

export interface ResolvedSender {
  from: string;
  keySource: "org" | "platform";
  usedFallback: boolean;
  /** Non-null exactly when usedFallback. Written to the failure log. */
  fallbackReason: FallbackReason | null;
}

export function resolveSender(input: {
  settings: { from_name: string; from_email: string; resend_api_key: string | null } | null;
  platformFrom: string;
  platformKeyPresent: boolean;
  /** Owner-facing internal reports pass true. Customer-facing mail passes false. */
  allowPlatformFallback: boolean;
  /** Set on a retry, after the org identity has already failed once. */
  priorFailure?: string | null;
}): { ok: true; sender: ResolvedSender } | { ok: false; error: string };
```

Decision table, which is also the test matrix:

| settings | org key | allowFallback | priorFailure | Result |
|---|---|---|---|---|
| present | present | either | none | org from, org key, no fallback |
| present | absent | either | none | org from, **platform key** (today's behaviour, preserved) |
| **missing** | — | **false** | — | **error** — unchanged for customer-facing |
| **missing** | — | **true** | — | platform from, platform key, `org_settings_missing` |
| incomplete | — | true | — | platform from, platform key, `org_settings_incomplete` |
| present | present | true | set | platform from, platform key, `org_send_failed` |
| present | present | false | set | error — no silent retry for customer mail |
| any | — | true | — | **error** if `!platformKeyPresent` — never pretend |

`allowPlatformFallback` is opt-in, not default. Customer-facing behaviour is unchanged by design: a business that has not configured email should not be silently emailing its customers from `noreply@tidywise`.

### The fallback must not mask a broken identity

`org_email_send_failures` already has the columns for this — `method` and `fell_back_to` (`20260708093246_*.sql:148-149`). Recording `fell_back_to = 'platform'` gives both properties at once:

- **The row exists**, so `SELECT organization_id, count(*) FROM org_email_send_failures WHERE fell_back_to = 'platform'` names exactly who is misconfigured.
- **It is not counted as a non-delivery.** Per the existing convention (follow-up item 11), the owner-facing health banner counts hard failures as `fell_back_to IS NULL`. A delivered-via-fallback send correctly does not alarm the owner about mail that arrived.

So the requirement is met by *using* the existing schema rather than adding to it. The plan adds no columns.

Every fallback also emits one `console.warn` naming the org, the reason, and the original error — so it is visible in function logs, not only in a table.

---

## Task E1 — the pure resolver

**Files:** Create `supabase/functions/_shared/email-sender-resolution.ts`; Test `src/lib/emailSenderResolution.test.ts` ✅ written — **15 tests**, RED verified (module absent)

- [ ] **Step 1: Add throwing stubs so the spec links, then watch it fail per-test.** A static named import of a missing export is a link-time `SyntaxError` — `node:test` collects zero tests, which is a real RED but cannot tell 15 wired tests from a typo. Same lesson as `_shared/facebook-lead-mapping.ts`.

```bash
node --experimental-strip-types --test src/lib/emailSenderResolution.test.ts
```

- [ ] **Step 2: Implement against the decision table above.** No I/O, no imports.
- [ ] **Step 3: 15/15 green, eslint clean, and `grep -c '^import'` on the module returns 0.**

## Task E2 — payroll uses it

**Files:** Modify `supabase/functions/_shared/payroll-period-process.ts`

- [ ] Resolve the sender before constructing the client, with `allowPlatformFallback: true`.
- [ ] `new Resend(keySource === "org" ? settings.resend_api_key : platformKey)`.
- [ ] On a send failure that looks like an identity problem, re-resolve with `priorFailure` set and retry once with the platform identity. The existing retry (`:747-759`) becomes an identity-escalating retry rather than a blind repeat.
- [ ] Remove the `no_email_settings` early skip for the email path — it is now a fallback trigger, not a terminal state. **Keep** the skip reason in the result type for reporting.
- [ ] Log the fallback to `org_email_send_failures` with `fell_back_to = 'platform'`, and `console.warn`.
- [ ] The platform from is a single shared constant, not another inline `noreply@…` literal — there are already 11 copies of `noreply@tidywisecleaning.com` and 3 of `noreply@jointidywise.com` across the functions.

## Task E3 — `sendOrgEmail` gains the opt-in

**Files:** Modify `supabase/functions/_shared/send-org-email.ts` and the owner-facing callers

- [ ] Add `allowPlatformFallback?: boolean` to `SendOrgEmailOptions`, defaulting **false**.
- [ ] Replace the early return at `:200-213` with: resolve → if the resolver errors, log and return as today; if it falls back, proceed with the platform identity.
- [ ] Set the flag at the owner-facing call sites only: `send-admin-booking-notification`, `notify-invoice-paid`, `notify-quote-accepted`, `send-month-end-pnl-reminder`, `send-gmail-test-email`, `send-test-org-email`.
- [ ] Leave all customer-facing callers untouched, and say so in the code — an unexplained absent flag reads like an oversight.

## Task E4 — `weekly-business-report`

**Files:** Modify `supabase/functions/weekly-business-report/index.ts:324`

- [ ] Use the resolver instead of `if (settingsResult.success && …)`. Same 22 orgs, same fix.
- [ ] Add the missing `else` branch: a skipped send must log rather than vanish.

## Task E5 — verification

Deployment is Lovable-only, and the resolver's decisions are covered by E1's unit tests. What must be checked live:

- [ ] One payroll run in dry-run mode across all 30 orgs, reporting which resolve to `org` and which to `platform`. Expect ~22 `org_settings_missing`, ~7 `org_send_failed` on retry, 1 unverified-domain, 1 (TIDYWISE) unchanged on `org`.
- [ ] Then a real run. Confirm all 30 deliver, and that `org_email_send_failures` has ~30 rows with `fell_back_to = 'platform'` — the misconfigured orgs are still nameable.
- [ ] Confirm the health banner does **not** fire for fallback rows (`fell_back_to IS NULL` is its filter).
- [ ] Confirm TIDYWISE still sends from its own identity — the one org that works must not be regressed onto the platform sender.
- [ ] Check whether `weekly-payroll-summary`'s `noreply@resend.dev` sender is actually delivering.

---

## Self-review

**Requirement coverage.** Fallback when identity is missing or fails → the resolver's `missing`/`incomplete`/`org_send_failed` rows, covering all three reported buckets including the unverified domain, which needs a platform *from* and not just a platform key. Must not silently mask → `fell_back_to = 'platform'` in the existing schema, plus a `console.warn`; the row names the org and the reason survives. Other owner-facing email → `weekly-business-report` found with the identical gate, six `sendOrgEmail` callers found behind the same early return, and `weekly-payroll-summary` found already immune but sending from a sandbox domain.

**Deliberately not changed.** Customer-facing mail still fails closed when an org has no identity. Falling back there would mean silently sending a business's customer mail from TidyWise's address — a different and worse failure than not sending.

**Unverified.** Whether `noreply@tidywisecleaning.com` or `noreply@jointidywise.com` is the verified platform sender in Resend. Both appear in the codebase; one of them may be as unverified as the org domains this plan is working around. E2 must not hardcode a guess — confirm in the Resend dashboard first, because a fallback that fails for the same reason as the thing it replaces is worse than no fallback.
