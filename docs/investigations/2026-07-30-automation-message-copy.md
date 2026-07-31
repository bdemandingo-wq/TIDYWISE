# Automation message copy — where it lives, and why it isn't one system

**Investigated:** 2026-07-29/30. **Read-only.** No code changed by this work.
**Purpose:** the goal is that every automated message the system sends should be editable by the business owner. This documents what is actually there first, so a build starts from evidence rather than re-deriving it.

**Status of the goal:** not started. This is findings only.
**Planned 2026-07-30:** `docs/superpowers/plans/2026-07-30-editable-automation-messages.md`
— confirms `automation_steps` as the destination (the key alignment is proven there),
and inserts an audit step this document did not anticipate.

---

## The short version

The Automations tab looks like one feature and is **six unrelated message systems** plus a **complete copy editor that no sender reads**.

The single most important finding: **a working per-org message editor already exists, schema'd, RLS'd, reachable from the UI — and nothing sends from it.** An owner can rewrite a reminder's SMS body, press Save, get "Automation saved", and the reminder keeps sending a hardcoded string. That is not a missing feature; it is a disconnected one, and it changes the shape of the work from "design a template system" to "teach the senders to read the one that exists."

---

## 1. What the tab actually is

`src/components/admin/automation/AutomationsTab.tsx` renders rows from `organization_automations` (`:391-407`), keyed on `automation_type`.

- **9 live types** in `activeAutomationsMeta` (`:298-358`)
- **3 aspirational** in `availableAutomations` (`:360-382`) — `post_call_followup`, `card_expiry_alert`, `loyalty_milestone` — with no implementation behind them

**The tab is a switchboard, not an engine.** Its only write is `update({ is_enabled })` (`:590-598`). Each row's behaviour lives in a separate edge function, on its own cron, with its own queue table and its own copy.

Its fire-count block (`:409-500`) reads **five different tables** (`automated_review_sms_queue`, `booking_reminder_log`, `rebooking_reminder_queue`, `recurring_offer_queue`, `campaign_sms_sends`, plus `automation_fire_log`) and carries comments about their differing semantics — a good indicator that these were never one system.

`winback_60day` isn't even automatic. Its own description says so (`:325`): *"you send it from the Campaigns page (not automatic)"*.

---

## 2. Six homes for message copy

| Automation / message | Where the text lives | Editable? |
|---|---|---|
| appointment_reminder (client SMS) | hardcoded `send-booking-reminder:407-408`, `:503-513` | No |
| appointment_reminder (cleaner SMS) | hardcoded `send-booking-reminder:541`, `:579` | No |
| **review_request (automated)** | hardcoded `process-review-sms-queue:179` | **No — a template column exists and is ignored** |
| review request (manual button) | `business_settings.review_sms_template` → `send-review-request-sms:149` | **Yes** |
| review request (email, StaffPortal) | hardcoded HTML `send-review-request:159+` | No |
| rebooking_reminder | hardcoded `process-rebooking-reminders:164` | No |
| recurring_upsell | hardcoded `process-recurring-offers:181` | No |
| seasonal_promo | hardcoded `seasonal-promo-sender:212` | No |
| quote_stale_reengage | hardcoded `quote-stale-reengage:116` | No |
| abandoned_booking_recovery | default `followup-abandoned-booking:109`, overridable via request-body `message` (`:110`) | Partly |
| winback_60day | hardcoded `run-winback-drip:208` (`messages: Record<number,string>`) + HTML `:220-235` | No |
| weekly_summary | hardcoded, owner-facing | No |
| Campaigns | `automated_campaigns.body` / `.subject` | **Yes** |
| Booking confirmation email | `business_settings.confirmation_email_body` → `send-booking-email:196` | **Yes** |
| Reminder email | `business_settings.reminder_email_body` | **Editable but never sent** |
| Loyalty points earned | hardcoded HTML `send-loyalty-progress-email:282`, fired by a pg_net DB trigger | No |
| Invoice footer | `business_settings.invoice_footer_message` → `send-invoice:225` | Partly |
| Auth emails | `_shared/email-templates/*.tsx` React Email components | No (platform) |

**The six distinct storage mechanisms:**

1. Hardcoded template literal inside an edge function *(the majority)*
2. A `business_settings` text column *(4 of them)*
3. A dedicated table column — `automated_campaigns.body`
4. A request-body parameter — `followup-abandoned-booking.message`
5. A React Email component file — `_shared/email-templates/`
6. **An orphaned editor table nothing sends from** — `automation_steps`

---

## 3. The orphaned editor

`src/components/admin/automation/AutomationEditorDialog.tsx` — 429 lines. A complete authoring UI:

- Name, enable toggle
- 10 trigger types (`:41-52`)
- Multi-step sequences with per-step timing, channel and recipients
- **SMS body + email subject + email body textareas** (`:367-399`)
- Documented merge tokens (`:299`)

**It is reachable** — the pencil button on every row (`AutomationsTab.tsx:681`, `:743`).

It writes `automation_definitions` / `automation_triggers` / `automation_steps`, created in migration `20260707060120` — and the schema is *good*: a generated `offset_minutes` column (`:67-76`), RLS, and a conflict-detection trigger (`:105-157`) that blocks duplicate (org, trigger, channel, recipient, offset) tuples.

**No sender reads any of it.** The only references to all three tables across `src/` and all 202 edge functions are inside `AutomationEditorDialog.tsx` itself. The only SQL consumer of `automation_steps` is the conflict-check trigger.

Same shape as `invoice_branding` and `customers.credits` — written, never read — but worse, because the UI is convincing and returns a success toast.

---

## 4. Editable but broken in two different ways

**`reminder_email_body` — editable, previewable, testable, never sent.** Read only by `preview-org-email` and `send-test-org-email`. No production path reads it; `send-booking-reminder` contains no email code at all. It has a full editor at `SettingsPage.tsx:152`, `:892`.

**`review_sms_template` — honoured by the manual path, ignored by the automation.** `send-review-request-sms:149` reads it (triggered from `BookingsPage:1630`). But the automation the tab *counts* — `automated_review_sms_queue` → `process-review-sms-queue` — hardcodes at `:179`. **So the copy an owner edits in Settings is not the copy their automation sends.**

---

## 5. Tokens: two syntaxes, three engines, three vocabularies

**Single brace `{token}` — SMS:**

| Site | Tokens |
|---|---|
| `process-campaign-queue:917-922` | `{first_name}` `{last_name}` `{company_name}` `{booking_link}` |
| `send-review-request-sms:150-155` | `{customer_name}` `{company_name}` `{cleaner_name}` `{service_name}` `{review_link}` |
| `followup-abandoned-booking:134-136` | **only** `{first_name}` `{company_name}` |

**Double brace `{{token}}` — email**, via the one real engine, `_shared/org-email-renderer.ts:57`:

```ts
out = out.replaceAll(`{{${key}}}`, String(val ?? ""));
```

Data supplied at `send-booking-email:222-231`: `customer_name`, `booking_number`, `service_name`, `scheduled_date`, `scheduled_time`, `address`, `total_amount`, `company_name`.

**And a third vocabulary matching neither runtime** — `AutomationEditorDialog.tsx:299` advertises `{{customer_name}}, {{company_name}}, {{booking_date}}, {{cleaner_name}}, {{review_link}}, {{booking_link}}`. Double-brace, but `{{booking_date}}` exists in no engine, and double-brace is never used for SMS.

**Consequences for owner-authored copy:**

- Vocabulary differs per message. `{cleaner_name}` works in the manual review SMS, not in campaigns. `{booking_link}` works in campaigns but **not** in the abandoned-booking follow-up, which replaces only two tokens — so it would ship literal braces to the customer.
- Every engine is "replace what I know, leave the rest". No validation, no unknown-token error. A typo'd `{firstname}` goes out verbatim.
- Fallbacks disagree: `{first_name}` → `''` in campaigns (`:919`) but `'there'` in abandoned-booking (`:135`). A blank first name yields **"Hi !"** in a campaign.
- `{booking_link}` is not a plain URL — it carries a per-recipient tracking ref (`process-campaign-queue:914-915`). An owner pasting a raw booking URL silently breaks attribution.

---

## 6. What must NOT be freely editable

### The STOP line — and the hole is already open

**It is never appended by code.** It exists only as characters inside copy strings. `_shared/marketing-guard.ts` is opt-out *suppression* only (`isOptedOut`, `filterOptedIn`, `isPhoneOptedOut`); it never touches outgoing text. `process-campaign-queue` substitutes tokens and sends, adding nothing.

Today it is only a **prefilled default**: seeded at `CampaignWizard.tsx:122` and `:320`, and instructed to the AI at `generate-campaign-templates:73`, `:131-139`. But `CampaignEditDialog.tsx:110-119` is a **bare textarea with no validation** — an owner can delete "Reply STOP to opt out." and save, and nothing re-adds it.

**That compliance gap exists now, on the one system that already has editable copy**, independent of any new work.

Hardcoded senders that currently carry it: `seasonal-promo-sender:212`, `run-inactive-campaign:128`, `followup-abandoned-booking:109`. Making those editable without a guard multiplies the exposure.

**The rule is per-message-class, not global.** Transactional messages (appointment reminder, booking confirmation) correctly have *no* STOP line — it isn't required and would be wrong. So any template system needs to know a message's class, and **`organization_automations` has no such field.**

### Also protect

- **`_shared/email-footer.ts`** — the CAN-SPAM footer. Correctly centralised and not exposed. *But note it hardcodes **TidyWise's own** postal address (`:13`) and support unsubscribe mailto (`:16`). That is right for platform mail and arguably wrong for an org's marketing email, which needs that org's physical address to be compliant. Worth its own look.*
- **The tracked `{booking_link}`** — see above.
- **Auth emails** (`_shared/email-templates/*.tsx`) — password reset and magic link must never be org-editable. Phishing vector.
- **Unsubscribe links** — `handle-email-unsubscribe` exists; the link must stay system-generated.

---

## 7. `organization_automations.settings` is not the right home

Added by migration `20260331142235` (`ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'`).

**It is completely unread.** Every edge-function query against that table selects only `is_enabled` and/or `organization_id`: `openphone-webhook:572`, `send-booking-reminder:163`, `run-inactive-campaign:92`, `weekly-business-report:44`, `process-review-sms-queue:54`, `process-recurring-offers:55`, `ai-sms-reply:72`, `quote-stale-reengage:41`, `seasonal-promo-sender:122`, `run-winback-drip:50`, `process-rebooking-reminders:55`. The frontend `select('*')` pulls it and never uses it.

**Correction worth recording:** the campaign throttle is **not** in that JSONB. It is `automated_campaigns.throttle_seconds`, a typed column read at `run-inactive-campaign:132-145`.

**Three reasons it should not hold templates:**

1. **Cardinality.** One row per (org, automation_type). But `appointment_reminder` needs N intervals × client/cleaner variants, and winback has 3 drip steps with different copy. A single blob forces hand-rolled nested arrays and ordering.
2. **It duplicates `automation_steps`**, which already exists normalised with a generated `offset_minutes`, per-step enable flags, channel/recipient columns, RLS and conflict detection.
3. **No column constraints in JSONB** — so no DB-level way to enforce the STOP line, no `NOT NULL`, no length check, no per-field audit.

`settings` is a good home for **scalar per-automation knobs** — quiet hours, caps, per-org offsets. Not message bodies.

---

## 8. Email vs SMS are not in the same place

- **Email:** `business_settings.confirmation_email_body` / `reminder_email_body` (+ `_sections` jsonb), rendered by `org-email-renderer.ts`, `{{double}}` tokens, with a real preview (`preview-org-email`) and test-send (`send-test-org-email`).
- **SMS:** one column for one message (`review_sms_template`), everything else hardcoded, `{single}` tokens, **no preview, no test-send anywhere**.
- **Campaigns:** the only shared home — one `body` column for both channels, selected by `channel` (`CampaignWizard.tsx:182`, `:250`), with `subject` only meaningful for email.
- **`automation_steps`** is the only design that models both properly: `sms_body`, `email_subject`, `email_body`, and a `channel` enum including `'both'`.

Email is markedly more mature.

---

## 9. Verdict: several systems, one tab

**Evidence they are not one feature:**

- 6 storage mechanisms
- 2 token syntaxes, 3 substitution engines, 3 disjoint vocabularies
- Review requests alone have **3 senders with 3 copy sources**, one of which ignores the editable template
- Dedupe state across 6+ tables
- One member (`winback_60day`) isn't automatic
- One member takes its copy from a request parameter

**But the coherent design already exists.** `automation_definitions` + `automation_triggers` + `automation_steps`, with `AutomationEditorDialog` on top. Someone built the unified feature, schema'd it, RLS'd it, gave it a UI — and never connected the senders.

So the work is **a per-sender migration onto an existing table**, plus the one thing that design lacks: a **message-class field and a STOP guard**, which exist nowhere in `automation_steps` today.

---

## Where to start, if building

> **Revised in planning.** A step 0 was added ahead of all of these: **audit whether any
> org already has rows in `automation_steps`.** The editor has been live and writing
> since `20260707060120`, and every owner who used it was told "Automation saved". The
> moment a sender reads that table, all of that copy ships — untested and possibly
> years old. Check before task 3, not after a customer receives it.
>
> Also revised: token work cannot be entirely last. The pilot needs one resolver on day
> one; what waits until last is *unifying the three legacy engines*, which have live
> owner copy behind them.

1. **Fix the live compliance hole first** — validation in `CampaignEditDialog` so the STOP line can't be deleted from a marketing SMS. Independent of everything else, and it's exposed now.
2. **Add a message class** to `automation_steps` (`transactional` | `marketing`), because the STOP rule is per-class and nothing currently records the class.
3. **Migrate one sender end-to-end** — `quote_stale_reengage` is the smallest (single message, single token set, `quote-stale-reengage:116`). Prove the read path before touching the reminder, which has the most variants.
4. **Unify tokens last.** Two syntaxes are survivable; changing them mid-migration is not. Pick one, write a single resolver, and validate unknown tokens rather than passing them through.

## Constraints for whoever picks this up

- `supabase/` is Lovable's. Edge-function and schema changes ship as paste-ready Lovable prompts ending in "confirm deployed, not just committed."
- **Verify the deployed function, not the repo** — these have diverged before.
- Rule 4b: migration files are a hypothesis. Confirm `automation_steps` still matches `20260707060120` live before building on it.
- Anything that sends marketing SMS touches TCPA exposure. `marketing-guard.ts` fails closed by design — keep it that way.
