# Editable copy for every automation

## 1. Inventory — customer-facing text, owner, and where the literal lives

| Automation | Channel | Edge function (owner) | Where the literal lives today |
|---|---|---|---|
| Booking confirmation | SMS | `send-booking-reminder` | already templated (`_shared/automation-templates.ts` → `booking_confirmation`) |
| Appointment reminder (48h+) | SMS | `send-booking-reminder` | already templated (`reminder_advance`) |
| Appointment reminder (≤2h) | SMS | `send-booking-reminder` | already templated (`reminder_soon`) |
| Quote stale re-engage | SMS | `quote-stale-reengage` | already templated (`quote_stale_reengage`) |
| Rebooking reminder | SMS | `process-rebooking-reminders` | inline literal, `index.ts:164` (contains 🏠 and an em dash) |
| Recurring upsell | SMS | `process-recurring-offers` | inline literal, `index.ts:181` |
| Review request (queued) | SMS | `process-review-sms-queue` | inline literal, `index.ts:179` |
| Review request (on demand) | SMS | `send-review-request-sms` | `defaultTemplate` at `index.ts:148`, overridable by `business_settings.review_sms_template` — a second, older editing path |
| Seasonal promo | SMS | `seasonal-promo-sender` | inline literal, `index.ts:212` (hardcodes its own "Reply STOP") |
| Missed-call textback | SMS | `openphone-webhook` | inline literal, `index.ts:625` |
| Abandoned booking recovery | SMS | `followup-abandoned-booking` | `defaultMessage` at `index.ts:109`; caller may pass `message` |
| Win-back 60 days | **Email (HTML)** | `run-winback-drip` | `buildWinbackEmail()` — 3 step bodies at `index.ts:208-212` inside a full HTML shell |
| Weekly business summary | **Email (HTML)** | `weekly-business-report` | subject + HTML built inline, `index.ts:219-296` |
| AI SMS reply | SMS, generated | `openphone-ai-sms-reply` | no fixed body — a system prompt, filled per message by the model |

Cleaner/tech-facing messages (reminder rows with `recipient_cleaner`, `recurring_lapse_alert`, payroll and staff notifications) are out of scope, unchanged.

## 2. Your three expectations

- **Weekly Summary is email, not SMS** — correct. So is **Win-back 60 days**, which you listed as SMS. Both are full HTML emails with a subject line. Segment counting must be suppressed for them, and only the *body prose* is editable — not the HTML shell, header, stat table, or footer. Editing surface for these two: subject + one or three short prose blocks, rendered in a preview that shows the real branded shell.
- **AI SMS Reply is generated** — correct, with one nuance. There is no message template to edit, but there *is* an editable surface worth exposing later: the tone/instructions block in the system prompt. That is a different kind of field (free prose, no placeholders, no length rule) and I'd keep it out of the Messages tab for now rather than pretend it's a template.
- **Cleaner-facing untouched** — confirmed, same rule as before.

## 3. Non-GSM-7 audit of the shipped defaults

Every character outside GSM-7 forces the whole message to UCS-2, cutting the per-segment budget from 153 to 67.

| Template | Offender | Replacement |
|---|---|---|
| `quote_stale_reengage` | `—` | `-` |
| `reminder_advance` | `—` | `-` |
| `reminder_soon` | `—` | `-` |
| `booking_confirmation` | none | — |
| Rebooking reminder | `🏠` emoji **and** `—` | drop emoji, `-` |
| Missed-call textback | `—` | `-` |
| Recurring upsell, seasonal promo, review request ×2, abandoned booking | none found | — |

Labels shown in the editor UI keep their em dashes; only the `sms_body` strings change. I will add a unit test that scans every default in `AUTOMATION_DEFAULTS` and fails on any non-GSM-7 character, so a future default cannot regress this silently.

## 4. Build plan

1. **Extend the vocabulary/defaults registry** (`src/lib/automationTemplates.ts` + its verbatim Deno copy) with one key per automation above, each with its own token list, `message_class` (marketing vs transactional), and channel (`sms` | `email`). Email keys carry `subject` alongside body.
2. **`AUTOMATION_ROW_TYPE` mapping** — every key maps to its `organization_automations.automation_type` row. Custom copy is stored in `settings.templates[key]`, exactly as the reminders already do.
3. **Editing does not require enabling.** The editor writes to `organization_automations` rows regardless of `is_enabled`; where no row exists it is created disabled. The Messages tab lists every automation with a muted "Off" chip rather than hiding it.
4. **Messages tab** grows grouped sections (Bookings, Retention, Marketing, Email) with per-key: token chips, live preview through the same resolver the sender uses, segment/encoding readout for SMS only, non-GSM-7 warning naming the offending character, and Reset to default.
5. **Senders** switch from string literals to `resolveTemplate(key, customBody, vars)` with the shipped default as fallback. Every sender keeps the existing behaviour on a bad template: log a warning, send the default, never a blank text and never literal braces.
6. **`send-review-request-sms`** additionally migrates `business_settings.review_sms_template` into the new store on first read, so the two editing paths converge instead of fighting.
7. **Marketing keys** keep their STOP line appended by code, outside the editable body; `seasonal-promo-sender` drops its hardcoded one to avoid a double.

## 5. Deploy cost

Nine edge functions change and each is a separate deploy:

`process-rebooking-reminders`, `process-recurring-offers`, `process-review-sms-queue`, `send-review-request-sms`, `seasonal-promo-sender`, `openphone-webhook`, `followup-abandoned-booking`, `run-winback-drip`, `weekly-business-report`

Two more need a redeploy only because the shared defaults change (em dash → hyphen):

`send-booking-reminder`, `quote-stale-reengage`

**Total: 11 deploys.** They are independent — the frontend Messages tab ships once and each sender can land on its own schedule; until a sender is deployed, its custom copy is saved but not yet used. If you want to trim, the cheapest useful cut is dropping the two email automations (win-back, weekly summary), which brings it to **9** and removes all HTML-editing surface.
