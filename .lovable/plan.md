
# Enhanced Automation Center — Design Spec

A GoHighLevel-style workflow builder layered on the existing Automation Center. Every automation becomes editable (message body, channel, timing, triggers) while the current toggle/enable pattern and visual language stay intact. Admins/owners only.

---

## 1. Trigger Model

Each automation is assigned one or more triggers from a fixed catalog:

| Trigger key             | Fires when                                                |
| ----------------------- | --------------------------------------------------------- |
| `booking_created`       | New booking row inserted                                  |
| `booking_confirmed`     | Booking status → confirmed                                |
| `booking_paid`          | Payment captured / invoice paid                           |
| `booking_completed`     | Booking marked complete                                   |
| `quote_sent`            | Quote status → sent                                       |
| `time_before_appointment` | X hrs/days BEFORE `scheduled_at`                        |
| `time_after_appointment`  | X hrs/days AFTER `completed_at` / `scheduled_at`        |
| `recurring_lapse`       | Recurring booking's next date passed with no child       |
| `customer_inactive`     | No booking for N days                                     |
| `holiday_offset`        | N days before a US holiday                                |

An automation can bind multiple triggers (e.g. Post-Booking = `booking_created` + `booking_confirmed`). Time-based triggers require an offset (`offset_value`, `offset_unit`, `direction`).

---

## 2. Automation Structure

An automation = header (name, icon, enabled, triggers) + ordered list of **steps** (intervals). Each step is one send.

Step fields:
- `label` — editable, e.g. "Post-Booking Confirmation"
- `offset_value` + `offset_unit` (`minutes|hours|days`) + `direction` (`before|after`) relative to the trigger anchor
- `channel` — `sms` | `email` | `both`
- `recipient_client` (bool), `recipient_cleaner` (bool)
- `sms_body` (text, merge tokens allowed)
- `email_subject` + `email_body` (rich text, merge tokens)
- `enabled` (per-step)

Merge tokens: `{{customer_name}}`, `{{company_name}}`, `{{booking_date}}`, `{{booking_time}}`, `{{cleaner_name}}`, `{{review_link}}`, `{{booking_link}}`, `{{quote_link}}`, `{{amount}}`.

---

## 3. Conflict Prevention

A conflict = same `organization_id` + overlapping trigger key + same channel + same recipient + same effective offset (normalized to minutes) across any two enabled steps in any two enabled automations.

On save:
1. Compute the set of `(trigger_key, channel, recipient, offset_minutes)` tuples for the automation being saved.
2. Query all other enabled steps in the org; reject if any tuple matches.
3. Error surfaces inline: *"'Appointment Reminder → 24 Hours Before → Client SMS' already occupies this slot. Change the timing, channel, or disable the other step."*

Rules:
- `both` expands to two tuples (sms + email) for the check.
- Exact-time triggers (`booking_created` etc.) use offset 0.
- The `holiday_offset` trigger scopes uniqueness per-holiday.

---

## 4. Post-Booking Automation (Priority Build)

New default automation seeded per org, disabled by default.

Header:
- Name: **Post-Booking**
- Trigger selector (multi-select chips): Booking Created / Booking Confirmed / Booking Paid — at least one required.

Default steps (all editable, all disabled until owner reviews):
1. "Post-Booking Confirmation" — 0 min after — SMS — Client
2. "24 Hour Check-in" — 24 hrs after — SMS — Client
3. "3-Day Thank You" — 3 days after — Email — Client

Layout mirrors the existing Appointment Reminder edit panel: row per step with label input, numeric offset + unit select, Client/Cleaner toggles, channel segmented control (SMS | Email | Both), message editor(s), trash icon. **Add Interval** button at the bottom. Sticky **Save Schedule** bar.

---

## 5. Retrofit Existing Automations

Each of the nine existing automations gets the same edit panel. Their current hardcoded behavior becomes the seeded default step so nothing changes on upgrade.

| Automation           | Seeded trigger(s)           | Seeded step defaults                              |
| -------------------- | --------------------------- | ------------------------------------------------- |
| Appointment Reminder | `time_before_appointment`   | Existing 5d / 3d / 24h / 1h rows preserved       |
| Review Request       | `booking_completed`         | 30 min after, SMS, Client                         |
| Rebooking Reminder   | `time_after_appointment`    | 28 days after, SMS, Client                        |
| Recurring Upsell     | `booking_completed`         | 2 hrs after, SMS, Client                          |
| Winback 60 Days      | `customer_inactive`         | 60 days, SMS, Client                              |
| Quote Stale Reengage | `quote_sent`                | 3 days after, SMS, Client                         |
| Weekly Summary       | Cron (Mon)                  | Email, Owner                                       |
| Recurring Lapse Alert| `recurring_lapse`           | Immediate, SMS, Owner                             |
| Seasonal Promo       | `holiday_offset`            | 3 days before each holiday, SMS, Client           |

Existing fire-log and dedupe behavior remain in the runners; only the message body, channel, timing, and recipient are now data-driven.

---

## 6. UI/UX

- Automations list unchanged; each card gets an **Edit** action opening a full-screen (mobile) / large-dialog (desktop) editor.
- Editor sections, top-to-bottom: **Triggers** (chip multiselect), **Steps** (stacked cards, drag to reorder), **Add Interval**, **Enable automation** toggle.
- Step card shows: label field · timing row (number + unit + before/after) · recipient toggles (Client / Cleaner / Owner as applicable) · channel segmented control · collapsible message editor (SMS text area with 160-char counter; Email subject + rich-text body; both if channel = Both).
- Sticky bottom save bar on mobile with safe-area padding, matching booking form.
- Inline conflict errors highlight the offending step in red with the conflicting automation named.
- Preserve existing icons, dark surface tokens, amber accent toggle.

---

## 7. Data Model

New tables (all org-scoped, RLS by `has_role`/org membership, GRANT to `authenticated` + `service_role`):

```text
automation_definitions
  id uuid pk
  organization_id uuid fk
  automation_key text            -- 'post_booking', 'appointment_reminder', etc.
  name text
  enabled boolean default false
  created_at, updated_at

automation_triggers
  id uuid pk
  automation_id uuid fk
  trigger_key text               -- enum above
  offset_value int null          -- for time_* / holiday_offset
  offset_unit text null          -- minutes|hours|days
  direction text null            -- before|after
  meta jsonb null                -- e.g. { holiday: 'christmas' }

automation_steps
  id uuid pk
  automation_id uuid fk
  position int
  label text
  offset_value int
  offset_unit text
  direction text                 -- before|after|immediate
  channel text                   -- sms|email|both
  recipient_client boolean
  recipient_cleaner boolean
  recipient_owner boolean
  sms_body text
  email_subject text
  email_body text
  enabled boolean default true
  -- Generated column for conflict check:
  offset_minutes int generated always as (...) stored
```

Indexes:
- `automation_steps (organization_id, enabled, channel, offset_minutes)` for conflict lookups.
- Unique partial index enforcing `(organization_id, trigger_key, channel, recipient, offset_minutes)` across enabled steps — Postgres exclusion constraint or trigger-based validation since recipient is multi-column.

Runner changes:
- Existing edge functions (`send-review-request-sms`, `seasonal-promo-sender`, reminder cron, etc.) read step rows for the org instead of hardcoded text; loop over each enabled step and dispatch by channel.
- New `post-booking-dispatcher` cron + `booking_created` webhook that materializes scheduled sends into `automation_fire_log` with `run_at` timestamps.

Migration path: seed one `automation_definitions` row per existing automation per org on rollout with `enabled = <current org toggle>` and steps matching today's behavior, so nothing regresses.

---

## 8. Out of Scope (for this build)

- Branching / conditional logic (if/then)
- Non-template AI-generated messages
- Third-party channel providers beyond current OpenPhone + Resend
- Editing message bodies for `Weekly Summary` sections (structure is fixed; only subject/intro configurable)

---

## 9. Acceptance Criteria

- Owner can edit any of the 10 automations' name, triggers, steps, messages, channels, recipients, timing, order.
- Attempting to save an automation whose step collides with another enabled step's `(trigger, channel, recipient, offset_minutes)` returns a clear inline error naming the conflict.
- Existing automations continue to fire with identical behavior after seeding until an owner edits them.
- All runners send via SMS, Email, or both based on the step config.
- Full mobile parity with existing admin dialogs.
