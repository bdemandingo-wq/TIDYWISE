# Phase 4: Close the Opt-Out Gap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for a marketing SMS to reach someone who has opted out, and close the two holes in STOP detection itself.

**Architecture:** All enforcement goes through `_shared/marketing-guard.ts`, which Phase 2 built and which fails closed. The guard gains one capability it lacks — opt-out lookup **by phone number** — because two of the paths that need it have no `customer_id` to work with.

**Scope:** Backend only. Every task is a Lovable prompt.

---

## Scope correction: one of the five is not a marketing sender

**`copilot-reengagement-cron` is out.** It messages the **business owner**, not customers.

Verified rather than inferred: every `recipient:` in its nudge planner is `ownerEmail` or `ownerPhone`, resolved from `org.owner_id → profiles`, and the function **never reads the `customers` table at all**. Its own comment says "Owner profile — most nudges target the owner directly."

It is an onboarding/activation nudge — "Hey Emmanuel, you haven't activated yet." Gating that on `customers.marketing_status` would look up an owner's profile id in the customers table, find nothing, and either no-op or fail closed and suppress a legitimate product notification. Either outcome is wrong.

My original Phase 3 report listed it. That was a mistake: I read "re-engagement" as customer marketing without checking who receives it. **Four senders need the guard, not five.**

---

## What each sender actually needs

Each resolves its recipient differently, so each needs a different call.

| Sender | Recipient identity | Guard call |
|---|---|---|
| `process-recurring-offers` | `item.customer_id` in a batch loop | `filterOptedIn` on the batch |
| `process-review-sms-queue` | `item.customer_id` in a batch loop | `filterOptedIn` on the batch |
| `send-tip-request` | one booking → joined customer | `isOptedOut` — **but the select omits `id`** |
| `followup-abandoned-booking` | **phone only — no `customer_id` exists** | `isPhoneOptedOut` (new) |

`abandoned_bookings` carries `phone`, `email` and `organization_id` and **no `customer_id`** — an abandoned booking is by definition someone who never became a customer record. That is why the guard needs a phone-based lookup, and it is the same capability the STOP fallback needs.

**On `send-tip-request`:** the most debatable of the four. It follows a completed job, so it is transactional-adjacent, but it solicits money and reads as promotional. Included as instructed; flagging that reasonable people would argue it.

---

## Phase 4A — Extend the guard (do this first)

- [ ] **4A.1** Add `isPhoneOptedOut(supabase, organizationId, phone)` to `_shared/marketing-guard.ts`.

**The risk that must be designed around:** phone formats. Senders normalise to `+1XXXXXXXXXX` before dispatch, but `customers.phone` is user-entered and holds `(555) 123-4567`, `555-123-4567`, `+15551234567`. A naive equality match silently finds nobody and returns "not opted out" for everyone — worse than no check at all, because it looks like enforcement.

So the comparison must be on digits only, last 10 digits, and it must **fail closed** like the rest of the guard.

---

## Phase 4B — Guard the four senders

- [ ] **4B.1** `process-recurring-offers` — `filterOptedIn` on the batch before the send loop.
- [ ] **4B.2** `process-review-sms-queue` — same. It already queries `customers` per item, so the guard slots in beside that.
- [ ] **4B.3** `send-tip-request` — add `id` to the joined customer select, then `isOptedOut` before dispatch.
- [ ] **4B.4** `followup-abandoned-booking` — `isPhoneOptedOut` per abandoned booking.

**Do not touch the transactional senders.** `send-arrival-sms`, `send-on-the-way-sms`, `send-booking-reminder`, payment and deposit links, card-collection links, staff and admin notifications. Different consent basis; gating them on marketing opt-out suppresses messages customers need and expect.

---

## Phase 4C — Fix STOP detection

- [ ] **4C.1** Multi-word replies. `openphone-webhook:924` normalises with `.replace(/[^A-Z]/g,'')` then requires an exact keyword match. So `"stop"`, `"Stop"`, `"STOP."` and `"STOP!"` all work, but `"stop texting me"` becomes `STOPTEXTINGME` and misses entirely. Match on the **first word** as well as the whole string.

- [ ] **4C.2** Unresolvable customers. At line 944, `customerIdToOptOut = convData?.customer_id || lastSend?.customer_id` — and if neither resolves, the block is skipped silently. The person texted STOP and nothing happened. Add a phone-number fallback using the same matching as 4A.1, and if it still cannot resolve, log at error level **with the phone number** so it can be fixed by hand.

---

## Verification

- [ ] **4D.1** Text `stop` from a test number → `marketing_status` flips to `opted_out`.
- [ ] **4D.2** Text `stop texting me` from a second test number → same result. This is the case that fails today.
- [ ] **4D.3** Text STOP from a number with **no** customer record and no campaign history → expect the error log naming the phone, not silence.
- [ ] **4D.4** For each of the four senders, confirm an opted-out recipient is skipped and the skip is logged with a customer id or phone.
- [ ] **4D.5** Confirm a transactional send to the same opted-out customer still goes through. This is the regression that would hurt most: silently suppressing arrival notices would look like the system working.

---

## Definition of done

1. None of the four marketing senders can message an opted-out customer.
2. `copilot-reengagement-cron` is unchanged and still nudges owners.
3. `"stop texting me"` opts someone out.
4. A STOP from an unrecognised number is loud, not silent.
5. Transactional messages to opted-out customers are unaffected.
6. Every skip is logged with enough identity to audit.
