# Editable automation message copy

## The short answer on your instinct

Your `organization_automations.settings` idea is right in shape but wrong in placement — because half of this already exists and works.

`src/lib/automationTemplates.ts` + `supabase/functions/_shared/automation-templates.ts` were built for `quote_stale_reengage`: a per-key vocabulary of allowed placeholders, save-time validation, and a send-time resolver that can never emit a blank or a literal `{brace}`. It reads the custom body out of `organization_automations.settings`. That is exactly the design you just described, already shipped and already tested (`automationTemplates.test.ts`).

So this is not "build the cheap path". It is "add three more keys to the path that already exists". No new tables, no schema change at all.

## Question 1 — the failure mode for a mistyped placeholder

`Hi {custmerName}!` never reaches a customer. Three gates:

1. **Save time.** The editor calls `validateTemplate(key, body)`. `{custmerName}` is not in that key's vocabulary, so save is rejected with a message naming the offending token and listing the valid ones. The admin fixes it while they are sitting there.
2. **Send time, unknown token.** If a bad row exists anyway (written before validation, or by a script), the resolver strips the braces and sends the bare word — `Hi custmerName!` — and logs a warning. Ugly, not broken, and never literal braces.
3. **Send time, missing required token.** Each key marks its load-bearing tokens required. A reminder without `{date}`/`{time}` has no purpose, so the resolver discards the custom body entirely and sends today's hardcoded default, logging why.

Case 4, known token with no data: resolves to empty string, because the sender already substitutes `there` for a missing name and `cleaning` for a missing service. A blank there means the sender genuinely had nothing.

Net: an admin cannot save a broken message, and no path in the resolver returns silence or braces.

## SMS segment count

Yes, and it should be a warning, not a block.

- GSM-7 is 160 chars, 153 per segment once it splits; a single non-GSM character (curly quote, emoji, en dash) drops the whole message to UCS-2 at 70/67.
- The editor shows `142 / 1 segment` live, turns amber at 2, and names the cause when encoding flips — "an emoji pushed this to 2 segments" is actionable, "2 segments" is not.
- Counted against the resolved preview with sample data, not the raw template, since `{customer_name}` is 15 characters and "Bo" is 2.
- The marketing opt-out line the sender appends is included in the count. It is invisible in the editor but the org pays for it.

## Which automations first

Three, from the `send-booking-reminder` cluster:

| Key | Today's hardcoded source |
|---|---|
| `booking_confirmation` | `:407` and the `else` branch at `:503` |
| `reminder_advance` | `>= 48h` branch |
| `reminder_soon` | `<= 2h` branch |

Why these: they are the highest-volume customer-facing messages, they are the ones orgs actually ask to reword, they share one vocabulary (`customer_name`, `service_name`, `company_name`, `date`, `time`, `address`), and they are all transactional — no opt-out interaction to reason about. One edge function, one prompt, one deploy.

Explicitly not in scope now: cleaner-facing reminders (internal, nobody asks), and the campaign/win-back/seasonal senders (marketing, opt-out and cap logic makes them a separate conversation). The 961 `organization_automations` rows are untouched — a row only gains a `settings` body when an admin edits one.

## The existing editor

`AutomationEditorDialog` writes to `automation_definitions` / `automation_triggers` / `automation_steps`, all of which have zero rows. It is a GHL-style multi-step graph builder for an engine that does not exist yet.

Leave it. Do not repoint it — the data models are not the same shape, and bending a step-graph editor into a single-textarea form produces a worse version of both. Build a plain `AutomationMessageEditor` beside it, add a **Messages** tab to the Automation Center, and put the message editing there. The old dialog stays reachable but stops being the thing an admin lands on for "change my reminder text".

If you want the dead builder removed, that is a separate cleanup — say so and I will do it as its own change.

## Preview

Reuse the pattern, not the functions. `preview-org-email` renders branded HTML; SMS is plain text and the resolver runs client-side, so preview needs no round trip — `resolveTemplate` in the browser against sample data renders instantly as the admin types, which is better than a button.

Send-test does need the backend: a **Send test to my phone** button reusing the org's OpenPhone identity, capped by the existing `abuse_throttle`, always to the signed-in admin's own number and never to a customer-supplied one.

## Technical detail

Frontend (mine):
- Extend `AutomationKey` and both `AUTOMATION_VOCABULARY` / `AUTOMATION_DEFAULTS` copies with the three keys, defaults copied verbatim from the edge function so nothing changes until an admin edits.
- `src/lib/smsSegments.ts` — encoding detection and segment count.
- `src/components/admin/automation/AutomationMessageEditor.tsx` — textarea, token chips, live resolved preview, segment counter, inline validation.
- `src/hooks/useOrgAutomationTemplates.ts` — read/write `organization_automations.settings.templates[key]`, org-scoped.
- New **Messages** tab in `AutomationCenterPage.tsx`; add the three entries to the Feature Guide.
- Tests extending `automationTemplates.test.ts` to cover the new keys, plus segment-count tests.

Backend (Lovable's — paste-ready prompt delivered separately, not edited here):
- `_shared/automation-templates.ts` gains the same three keys, kept verbatim in sync.
- `send-booking-reminder` fetches `organization_automations.settings` once per run and passes each body through `resolveTemplate`; the hardcoded literals become the defaults rather than being deleted.
- Warnings logged with org id and key so a bad row is findable.

## Verification

- Save a template with `{custmerName}` — rejected, token named.
- Force a row containing `{custmerName}` directly, then run the sender — customer receives `Hi custmerName!`, warning logged, no braces.
- Force a reminder body with no `{time}` — sender uses the default, warning logged.
- An org that never edits receives byte-identical text to today.
- Two orgs, custom bodies each — no cross-org bleed.
