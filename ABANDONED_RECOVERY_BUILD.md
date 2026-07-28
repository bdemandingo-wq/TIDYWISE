# Abandoned Booking Recovery — build runbook

Multi-day build. Full plan lives at `~/.claude/plans/dynamic-humming-reef.md`.

**Two locked decisions:** consent-gated (a prospect is only textable if they tick a box),
and one message ever — no sequences.

## Status

| # | Step | Owner | Done |
|---|------|-------|------|
| 0 | Phone capture guard (`PublicBookingPage.tsx`) | Claude Code | ✅ |
| 1 | Migrations | Lovable | ☐ |
| 2 | Shared sender + cron function | Lovable | ☐ |
| 3 | STOP for non-customers | Lovable | ☐ |
| 4 | Mark conversions server-side | Lovable | ☐ |
| 5 | Resume endpoint | Lovable | ☐ |
| 6 | Frontend: consent checkbox, upsert, `?resume=`, automation registration | Claude Code | ☐ |
| 7 | Schedule the cron | Lovable | ☐ |

**Order is not optional.** Step 1 blocks everything. Step 7 must not run until step 6 is
live — schedule the cron early and the first run targets a backlog where nobody consented.

Paste prompts 1–5 into the Lovable project chat one at a time, confirming each before the
next. A Lovable commit is not a deploy; every function prompt ends with the confirmation line.

## Standing warnings

- **Never backfill `sms_consent = true`.** Every pre-existing `abandoned_bookings` row
  predates the checkbox. That backlog also contains one-digit phones and people who already
  booked (`converted` has never been written — see plan).
- **STOP (step 3) should land before the cron.** Today a STOP from a non-customer is
  detected and then discarded, and non-customers are this feature's entire audience.
- Migrations are Lovable Cloud — a migration file in git is not proof it ran.

---

## Prompt 1 — Migrations (do this first, nothing else works without it)

```
Apply a migration for abandoned booking recovery. Do not change any edge functions yet.

1. Alter public.abandoned_bookings:
   - ADD COLUMN sms_consent BOOLEAN NOT NULL DEFAULT false
   - ADD COLUMN form_snapshot JSONB
   - ADD CONSTRAINT abandoned_bookings_session_token_key UNIQUE (session_token)
   (there is currently only a NON-unique index idx_abandoned_bookings_session; the
   unique constraint is required for the client's upsert to work)

2. The public booking page is anonymous, so it currently cannot update its own row —
   the only UPDATE policy is org-admins-only, which means step_reached and converted
   have never been written for any public booking. Add an anon policy scoped to the
   session token so a visitor can only ever touch their own row:

   CREATE POLICY "Anon can update own abandoned row by session token"
   ON public.abandoned_bookings FOR UPDATE
   TO anon, authenticated
   USING (true)
   WITH CHECK (true);

   Scope it as tightly as you can while still allowing an anonymous upsert keyed on
   session_token. If a tighter WITH CHECK is possible using the session_token column,
   use it. The row must NOT be able to change organization_id or sms_consent.

3. Anonymous callers must never be able to set sms_consent themselves. Replace the
   INSERT policy "Anyone can insert abandoned bookings with org" so it additionally
   requires sms_consent = false on insert. Consent is set server-side only.

4. Add index:
   CREATE INDEX idx_abandoned_bookings_recovery
   ON public.abandoned_bookings (organization_id, sms_consent, followup_sent, converted, created_at);

5. Create public.sms_suppressions:
   id UUID PK DEFAULT gen_random_uuid(),
   organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
   phone TEXT NOT NULL,
   source TEXT NOT NULL DEFAULT 'sms_stop',
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   UNIQUE (organization_id, phone)
   Enable RLS. Org members can SELECT (use the existing is_org_member helper).
   No anon access at all.

6. Seed the automation toggle for every existing org, disabled:
   INSERT INTO public.organization_automations (organization_id, automation_type, is_enabled, description)
   SELECT o.id, 'abandoned_booking_recovery', false,
          'Texts people who started a booking and did not finish, if they opted in'
   FROM public.organizations o
   ON CONFLICT (organization_id, automation_type) DO NOTHING;

Do NOT backfill sms_consent = true for any existing row. Every existing row predates
the consent checkbox and must never be texted.

Do NOT schedule the cron job yet — that comes after the frontend ships.

Confirm the migration actually ran against the database, not just that a file was committed.
```

---

## Prompt 2 — Shared sender + cron function

```
Create supabase/functions/_shared/abandonedRecovery.ts and a new edge function
supabase/functions/abandoned-booking-recovery-cron/index.ts.

The cron function:
- Gate with requireCronSecret from ../_shared/requireCronSecret.ts (x-cron-secret header).
- Load orgs from organization_automations where automation_type = 'abandoned_booking_recovery'
  and is_enabled = true. Follow the exact structure of seasonal-promo-sender/index.ts.
- For each org, call the shared module.

The shared module, per org:
- Read organization_sms_settings for openphone_api_key, openphone_phone_number_id,
  sms_enabled. Skip the org if sms_enabled is false or either credential is missing.
  Send FROM that org's own openphone_phone_number_id — never a shared number.
- Read settings JSONB from the organization_automations row:
  delay_hours (default 2, clamp 1-48) and message_template (optional per-org copy).
- Select from abandoned_bookings where organization_id matches AND sms_consent = true
  AND followup_sent = false AND converted = false AND phone IS NOT NULL
  AND created_at < now() - delay_hours AND created_at > now() - 7 days.
  Cap at 200 rows per org per run.
- Normalize each phone to +1XXXXXXXXXX.
- SKIP the row if any of these are true:
  (a) a sms_suppressions row exists for (organization_id, normalized phone)
  (b) an automation_fire_log row exists for
      (organization_id, 'abandoned_booking_recovery', normalized phone) — ANY age, this is
      a once-ever send
  (c) a booking exists for that org with that phone created after the abandoned row
      (they already booked; the converted flag is not trustworthy for old rows)
- Re-check (a) and (b) immediately before each individual send, not once per batch.
- Write the automation_fire_log row BEFORE calling OpenPhone, not after. If the send then
  fails, we under-send rather than risk double-texting. The current code in
  followup-abandoned-booking updates followup_sent only on response.ok, which double-sends
  if the DB write fails after a successful send.
- Respect quiet hours: skip the org entirely if it is before 08:00 or after 20:00 in that
  org's timezone (business_settings.timezone).

Build the link exactly the way send-deposit-request/index.ts does — that is the only
function that gets per-org custom domains right:
  const appUrl = (businessSettings?.app_url || Deno.env.get("APP_URL")
    || Deno.env.get("PROJECT_URL") || "https://jointidywise.com").replace(/\/+$/, '');
Take the slug from organizations.slug — NOT business_settings, which has no slug column.
Link is `${appUrl}/book/${slug}?resume=${session_token}`, then shorten it through the
short_urls table the same way send-deposit-request does.

Default message when the org has not set one:
  "Hi {first_name}! You started booking with {company_name} but didn't finish.
   Pick up where you left off: {link} — Reply STOP to opt out."
Every message must end with the STOP line.

Then rewrite supabase/functions/followup-abandoned-booking/index.ts to call the same shared
module for a single org. Keep its requireOrgAdmin gate and its testMode — the admin UI uses
it for preview. Delete its old inline default message (the one that says "visit our booking
page" with no URL).

Deploy both functions and confirm they are deployed, not just committed.
```

---

## Prompt 3 — STOP for non-customers

```
In supabase/functions/openphone-webhook/index.ts, the opt-out block around line 844-907
detects STOP correctly but only persists it when a customer row exists
(`if (customerIdToOptOut)`). Anyone who is not yet a customer — which is everyone the
abandoned-booking recovery texts — has their STOP silently discarded.

Change it so that on any detected opt-out keyword it ALWAYS upserts into sms_suppressions
(organization_id, phone = the inbound number normalized to +1XXXXXXXXXX, source 'sms_stop'),
whether or not a customer row exists. Keep the existing customers.marketing_status update
exactly as it is when there IS a customer — this is in addition, not instead.

Use the same inline retry approach already there. If the suppression write fails after
retries, log it at CRITICAL level with the phone number and org id.

Deploy the function and confirm it is deployed, not just committed.
```

---

## Prompt 4 — Mark conversions server-side

```
In supabase/functions/external-booking-webhook/index.ts, accept an optional session_token
in the request body. When present, after the booking is successfully created, update
public.abandoned_bookings set converted = true, converted_at = now() where
session_token matches AND organization_id matches the booking's org.

This runs with the service role, so it works where the anonymous client's own update
silently affects zero rows. Failure to update must not fail the booking — log and continue.

Deploy the function and confirm it is deployed, not just committed.
```

---

## Prompt 5 — Resume endpoint

```
Create supabase/functions/resume-abandoned-booking/index.ts.

POST { slug, token }. With the service role:
- Resolve organizations.slug -> organization id. If no match, return an empty result.
- Look up abandoned_bookings by session_token AND that organization_id.
- Return only: first_name, last_name, email, phone, service_id, step_reached, form_snapshot.
- Return an empty result (NOT an error) if the token is unknown, belongs to another org,
  is older than 7 days, or is already converted. Never reveal whether a token is real.
- Rate limit by IP — the token is a bearer credential sitting in an SMS link.

No auth header required (public booking page is anonymous), but it must be impossible to
enumerate: no listing, no error differences between "wrong token" and "expired token".

Deploy the function and confirm it is deployed, not just committed.
```

---

## Prompt 6 — Schedule the cron (LAST — only after the frontend consent checkbox is live)

```
Schedule the abandoned booking recovery cron, following
supabase/migrations/20260506204202_automation_phase_2_cron.sql exactly:

SELECT cron.schedule(
  'abandoned-booking-recovery',
  '0 * * * *',
  $$ SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
           || '/functions/v1/abandoned-booking-recovery-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ); $$
);

Unschedule first inside a DO block so re-applying is idempotent.
Confirm the job appears in cron.job.
```

---

## Verification (once all steps are done)

- **Two-org isolation** — enable for org A only, abandon a booking in each; only A's
  prospect is texted, link on A's domain with A's slug, sent from A's number.
- **Consent gate** — abandon without ticking the box: row exists, no text sent.
- **Phone capture** — type a number one digit at a time: no row until the 10th digit,
  stored value is the complete number.
- **Completer safety** — finish a booking: row marked converted, no text sent.
- **STOP** — reply STOP from a non-customer number: suppression row written, and a second
  abandoned session for that number is skipped.
- **Double-send** — run the cron twice: second run sends nothing.
- **Resume** — open the SMS link: form returns to the right step with selections intact.
  A tampered token starts a clean booking with no error shown.
- `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` before each commit.
