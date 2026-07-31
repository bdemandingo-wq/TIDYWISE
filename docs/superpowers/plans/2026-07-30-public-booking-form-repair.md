# Public Booking Form Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore public booking submission across all 87 orgs, without reopening the hole the secret check was added to close, and make the next failure visible on the day it happens.

**Architecture:** Split the two callers into two entry points that share one core. A new public endpoint carries no secret and is defended by rate limits, recorded origin, server-side pricing and a captcha. The existing webhook keeps its per-org secret for server-to-server integrations. Both delegate to a shared module holding the customer/booking/lead writes, so the business logic exists once. Every rejection on either path writes a failure row carrying enough contact detail to rescue the lead.

**Tech Stack:** Deno edge functions · Supabase Postgres · existing `_shared/rate-limit.ts` · Cloudflare Turnstile (proposed)

**Background:** `docs/bugs/2026-07-30-public-booking-form-trace.md`

## Global Constraints

- **Dead since ~2026-05-09, all 87 orgs.** Every day this stays broken is lost lead capture, so Task 1 is deliberately the smallest thing that restores service.
- **The public path can never hold a secret.** Anything the browser can send, a visitor can read and replay.
- **No hard allowlist may be the sole gate on the public path.** An origin allowlist fails exactly like the secret did — silently, on a config the org owner cannot see. If origin is enforced at all, a mismatch must be logged loudly and, initially, still allowed.
- **Failure logging ships in Task 1, not later.** The reason this ran three months undetected is that a rejection wrote nothing. That property must not survive the fix.
- **Failure rows must carry name, email and phone.** The point is not debugging — it is that a lost booking is still a lead somebody can ring.
- `supabase/` is Lovable's. Every task ships as a paste-ready prompt ending in "confirm deployed, not just committed."

---

## Decision 1: split the endpoints — but share the core

**You are right to lean split, and the evidence is stronger than instinct.** Recommend:

| Endpoint | Caller | Auth | `verify_jwt` |
|---|---|---|---|
| `public-booking-submit` **(new)** | the browser form, hosted or embedded | none — rate limits, captcha, recorded origin | `false` |
| `external-booking-webhook` **(kept)** | third-party server-to-server | `x-webhook-secret`, unchanged | `false` |

Both `import` a new `_shared/create-booking-from-payload.ts` carrying the customer upsert, conflict check, booking insert, lead insert and notification fan-out — the logic at `external-booking-webhook:151-400` today, moved rather than copied.

**Why split rather than two auth paths in one function:**

The codebase already has the dual-path pattern, done correctly, in at least four places — `run-inactive-campaign` (`isCronCall`), `sync-openphone-messages` (`isCron`), `zapier-dispatch` (`isInternalCall`) and `send-booking-reminder`. In every one the secret is a **mode discriminator** with a fallback to normal auth: `if (!isCronCall) { …authenticate normally… }`. None of them broke.

`external-booking-webhook` is the only function in the codebase that made the secret **mandatory** instead of discriminating on it. So dual-path is provably workable here — but that is an argument about mechanics, and the real problem is not mechanical:

1. **The two callers want opposite defaults.** An authenticated partner's payload can be broadly trusted. A browser payload must be treated as hostile — it is user-supplied, unauthenticated and, per `:288`, currently believed about *price*. Encoding both dispositions in one handler means every future edit must hold both in mind. The May change is the proof that someone will not.
2. **They want different limits.** A partner integration posting 200 bookings in a batch is normal; a browser IP doing that is an attack. One function means one rate-limit policy, or a branch that reintroduces the coupling.
3. **`verify_jwt` and function config are per-function.** Splitting lets the public endpoint be configured, monitored and — if it ever needs to be — disabled independently, without touching a working integration path.
4. **Blast radius.** The failure being fixed *is* the failure mode of a shared entry point. Splitting makes the class of bug structurally impossible rather than relying on the next editor's care.

**What splitting must not cost:** duplicated booking logic. Two copies of the customer/booking/lead writes would drift, and the drift would be invisible — the integration path would keep working while the public path quietly diverged. Hence the shared module. **Extracting it is the first task, before either endpoint changes.**

## Decision 2: what protects the public path

Ordered by value per unit of risk. The first two are the load-bearing ones.

**1. Rate limiting — reuse, do not build.** `_shared/rate-limit.ts` already exports `checkAndRecord(supabase, bucket, key, {maxPerWindow, windowSeconds})` and `getClientIp(req)`, and six functions already use it (`client-portal-login`, `send-staff-password-reset`, `check-email-staff`, …). Three buckets:

| Bucket | Key | Suggested |
|---|---|---|
| `booking_submit_ip` | client IP | 5 per 10 min |
| `booking_submit_org` | organization_id | 30 per hour |
| `booking_submit_email` | lowercased email | 3 per hour |

The per-org bucket is the one that matters for cost — it caps the damage a single targeted org can take. The per-email bucket kills the accidental double-submit that currently relies on the 409 conflict check.

**2. Server-side pricing — the real fix, and it is already half-written.** `external-booking-webhook:288` does `total_amount: payload.total_amount || 0`, i.e. the browser states its own price. The price-floor trigger is currently the *only* thing between a forged body and a $0 booking, and `docs/superpowers/prompts/2026-07-30-fix-price-floor-exemption.md` shows that floor is itself bypassable via a forged `recurring_booking_id`.

The public endpoint should **recompute the total from the org's own pricing** using the same inputs the form used (service, square footage, extras, frequency, pets, room reductions) and ignore the client's figure entirely — or accept it only to compare and log a mismatch. This closes the price hole properly instead of relying on a floor to catch the worst case. It is also what makes the Meta/GA4 conversion value trustworthy, which `PublicBookingPage:634-646` already flags as an open problem.

**3. Captcha — Cloudflare Turnstile.** The standard answer for an unauthenticated public form. Free, privacy-preserving, invisible for most users, and it works inside an iframe. Verify the token server-side on the public endpoint only. This is the single control that most reduces automated abuse.

**4. Origin — record, do not block. Initially.** The form is embeddable, so a hard allowlist recreates the exact failure being fixed: an org embeds on a new domain, submissions die, nobody is told. Instead:
- store `Origin` / `Referer` on every submission, success and failure
- add an optional per-org `allowed_embed_origins`
- **log** mismatches loudly rather than rejecting them
- only consider enforcing once the logged data shows what real traffic looks like

Enforcing on day one is how this bug happened. Do not repeat the shape.

**5. Cheap extras worth having:** a honeypot field (catches naive bots for nothing); required-field validation server-side rather than trusting the form; and the existing 409 conflict check at `:271`, which already handles double-booking and should move into the shared module unchanged.

**Not recommended:** an API key baked into the page, a signed token minted by another public endpoint (moves the problem one hop), or IP allowlisting (customers are on residential IPs).

## Decision 3: failure logging — the part that must not be deferred

A `booking_submission_failures` table, deliberately modelled on `org_email_send_failures`, which is the thing that made the invoice question answerable in one query.

```
id, created_at, organization_id (SET NULL, not CASCADE),
stage,                 -- 'rate_limited' | 'captcha' | 'validation' | 'conflict' | 'db_error' | 'auth'
reason,                -- human-readable
client_ip, origin, user_agent,
first_name, last_name, email, phone,   -- so the lead is RECOVERABLE, not just debuggable
payload jsonb,         -- the full body, for replay
path                   -- 'public' | 'integration'
```

Two things this must get right that the email equivalent did not need to:

- **`organization_id` is `ON DELETE SET NULL`.** Same reasoning as the revenue ledger — a deleted org must not erase evidence of lost business.
- **It holds PII, so it needs a retention policy.** 90 days is a reasonable default; state it in the migration comment rather than leaving it implicit. A table of names and phone numbers with no stated lifetime is a liability.

**Log successes too, or at least the attempt.** A row per submission with a terminal status would let you compute a conversion rate — how many people started versus completed — which is the number that would have surfaced this in week one rather than month three.

## Answer: is anything else broken the same way?

**No. `external-booking-webhook` is the only one.**

Checked all **127** functions the browser invokes from `src/` for a required secret header. Nine matched a first-pass grep; eight are safe on inspection:

| Function | Why it is fine |
|---|---|
| `create-subscription`, `record-tos-acceptance` | read `x-real-ip` / `x-forwarded-for` for IP capture, not auth |
| `morning-brief`, `evening-brief`, `send-booking-reminder` | **send** `x-cron-secret` outbound when fanning out per-org; no inbound requirement |
| `run-inactive-campaign` | `isCronCall` is a mode flag; `if (!isCronCall)` falls through to normal auth |
| `sync-openphone-messages` | `isCron` only adjusts page limits; the non-cron path uses the standard access check |
| `zapier-dispatch` | `isInternalCall` at `:141`, `if (!isInternalCall)` at `:143` — same pattern |

Every one of them treats the secret as a **discriminator with a fallback**. `external-booking-webhook` is the sole outlier that made it a gate. That is worth knowing beyond this bug: the codebase has a correct house pattern for exactly this situation, and this function departed from it.

---

## Task 1: Restore service — smallest change that works

**Deliverable:** public submissions succeed again, and every rejection from either path leaves a recoverable row.

**Interfaces produced:** `_shared/create-booking-from-payload.ts`, `booking_submission_failures`, `public-booking-submit`.

- [ ] **Step 1:** Migration — create `booking_submission_failures` with the columns above, `SET NULL` FK, RLS to org admins, and a stated retention policy.
- [ ] **Step 2:** Extract `external-booking-webhook:151-400` into `_shared/create-booking-from-payload.ts`. **Pure move, no behaviour change** — the integration path must be byte-identical in effect so a regression here is impossible to confuse with a new-endpoint bug.
- [ ] **Step 3:** Verify the integration path still works before adding anything new. This is the checkpoint that keeps Task 1 safe.
- [ ] **Step 4:** Create `public-booking-submit` (`verify_jwt = false`, no secret): rate limits on IP/org/email via the existing helper, then the shared module. Record origin and user-agent. Write a failure row on every rejection.
- [ ] **Step 5:** Point `PublicBookingPage.tsx:575` at the new function. **Client change only — one string.**
- [ ] **Step 6:** Add failure-row writes to `external-booking-webhook`'s 401 paths too, so a misconfigured integration is equally visible.
- [ ] **Step 7:** End-to-end test on a real org: submit the hosted form, confirm customer + booking + lead rows appear; then submit with a deliberately bad payload and confirm a failure row appears.

## Task 2: Server-side pricing

- [ ] Recompute the total in `public-booking-submit` from the org's pricing rather than trusting `payload.total_amount`; log any client/server mismatch as a failure row with stage `validation`.
- [ ] Re-read `docs/security/2026-07-29-booking-price-authority.md` and the price-floor prompt together — once pricing is server-side, the floor becomes defence in depth rather than the only defence, which may change how urgent that prompt is.
- [ ] Return the persisted total so `PublicBookingPage:646` can stop falling back to the browser figure for conversion tracking, and restore the Sentry warning removed in that block.

## Task 3: Captcha and origin

- [ ] Turnstile on the public form; verify server-side in `public-booking-submit` only.
- [ ] Record `Origin`/`Referer` on every submission; add optional per-org `allowed_embed_origins`; **log mismatches without rejecting**.
- [ ] Review a fortnight of recorded origins before deciding whether to enforce. Do not enforce blind.

## Task 4: Visibility

- [ ] Admin surface listing recent failed submissions with the contact details, so a lost booking becomes a callable lead.
- [ ] Alert on failure-rate spikes per org.
- [ ] Log successful attempts too, so start-versus-complete conversion is measurable.

---

## Self-review

- **Your three questions are answered:** split, with a shared core, and four concrete reasons (§Decision 1); rate limits + server-side pricing + captcha + recorded-not-enforced origin, with the existing rate-limit helper reused rather than rebuilt (§Decision 2); failure logging in Task 1 rather than later, carrying contact details so the lead survives (§Decision 3).
- **The extra check is done and the answer is no** — 127 browser-called functions examined, `external-booking-webhook` is the only hard gate, and the other eight follow a correct house pattern it departed from.
- **Deliberate sequencing:** the shared-module extraction (Task 1 Step 2) lands and is verified *before* the new endpoint exists, so if anything regresses it is unambiguous which change caused it. Restoring service does not wait on pricing, captcha or origin work.
- **Stated but not designed:** what `public-booking-submit` should do about `recurring_booking_id`, which the price floor exempts on trust. It should almost certainly refuse to accept that field from a browser at all — worth confirming when Task 2 is written.
