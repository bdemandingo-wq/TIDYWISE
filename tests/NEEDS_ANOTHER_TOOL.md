# Checklist items Playwright cannot honestly verify

Scope note: this list only covers what was explicitly asked for — section 4,
5.1/4.6, 6.x, 10.x, 11.1/11.2, 14.x, 15.3/15.4. Sections/items not mentioned
in either the AUTOMATE or this list (2.x onboarding, 7.x data integrity,
12.2/12.3/12.5, 13.1/13.3/13.4, 15.1/15.2, 16.x) were out of scope for this
pass and are still "Not Started" in the spreadsheet.

For each item below: why Playwright can't truly verify it, and the right
tool instead.

## Section 4 — Payments & Money (Stripe)

**4.1 Stripe checkout completes**, **4.2 upgrade/downgrade prorates**,
**4.3 PaymentIntent capture-decline**, **4.4 deposit + card-on-file**,
**4.5 refund**, **4.7 Stripe Connect payout**, **4.8 dunning/retry**:

Stripe Checkout/Elements render in a Stripe-hosted iframe on a different
origin. Playwright *can* technically type into Stripe's test-mode iframe,
but doing so from an E2E suite against **production** risks a real charge
the moment Stripe isn't actually in test mode for this org (confirmed live:
the QA owner org has no Stripe account connected at all — payments here use
"In-Person Payment" as a workaround, which proves nothing about the Stripe
path). The correct tool is **Stripe's own test-mode API** (`stripe-mock` or
a real test-mode secret key), driven directly against the `create-subscription`,
`confirm-deposit-payment`, `process-tip`, and Connect payout edge functions
with Stripe test card tokens (`pm_card_visa`, `pm_card_chargeDeclined`,
etc.) — bypassing the UI/iframe entirely. Stripe's CLI (`stripe trigger
payment_intent.payment_failed`) is the right tool for 4.8 specifically.

**4.9 recurring discount config**: this one IS UI/data testable once 3.1
(booking creation) is unblocked — not moved here for lack of a tool, but
because it depends on the same RLS blocker as the whole booking-ui.spec.ts
suite. Revisit once that's fixed.

## 5.1 / 4.6 — Wage and invoice math

**5.1 wage calc (flat/hourly/percentage)**, **4.6 invoice totals to the
cent**: these are pure functions (`src/lib/pricingEngine.ts`,
`src/lib/payrollCalculations.ts` or equivalent) — the correct tool is
**unit tests (Vitest/Jest) that call the calculation functions directly**
with a table of known inputs/outputs, not an E2E browser test. An E2E test
can only observe the *rendered* total, which conflates the calculation
with formatting/rounding/DOM display — a unit test isolates the math and
runs in milliseconds instead of a full page load per case. If this repo
doesn't have a unit-test runner configured yet, that's the actual gap to
close, not something to fake in Playwright.

## 6.x — Communications (SMS & Email)

**6.1 booking confirmation sends**, **6.2 reminders fire once**, **6.3
review request post-job**, **6.4 on-my-way text**, **6.5 unsubscribe
honored**, **6.6 Gmail OAuth send**: Playwright can click the button that
*triggers* a send and assert the edge function was invoked (network
response 200) — that's as far as UI automation can honestly go. It cannot
verify the SMS/email actually **arrived** with correct content, because
that happens in OpenPhone/Resend/Gmail's infrastructure, outside the app.
The right tool: **assert the send in the DB/logs**, not an inbox —
`send-booking-reminder`/`send-cancellation-sms-notification` etc. write
rows to tables like `sms_log`/`email_log`/`campaign_sends` (verify exact
table names in `supabase/functions/_shared/`), or check Supabase Edge
Function logs directly (`get_logs` via the Supabase MCP, or the dashboard)
for the OpenPhone/Resend API response. For 6.5 specifically, query the
`unsubscribed`/`opt_out` flag directly after triggering an opt-out request,
then confirm a subsequent send attempt is skipped in the logs — never
actually wait on a real inbox.

## 10.x — Native iOS App

**10.1 Capacitor build runs on a physical device**, **10.2 Payments tab
in native build**, **10.3 push notifications deliver**, **10.4 'Free' plan
for App Store review**, **10.5 deep links**, **10.6 web/native parity**:
Playwright drives a Chromium/WebKit browser context, not a compiled
Capacitor iOS binary — it cannot install/launch an `.ipa`, cannot receive
a real APNs push, and cannot exercise `capacitor://` deep links the way
iOS itself does. This is **manual QA on a physical device** (or Xcode
Simulator at minimum, though push notifications specifically require a
real device — simulators can't receive APNs). Use TestFlight for a
release-candidate build and a written device checklist; Appium/XCUITest
could theoretically automate parts of this later, but that's a different,
much heavier tool than Playwright and wasn't asked for here.

## 11.1 / 11.2 — Performance

**11.1 page load <3s**, **11.2 Core Web Vitals (LCP/CLS/INP)**: Playwright
timing under `page.goto()` measures *this specific run's* network/CPU
conditions (sandboxed CI environment, cold cache, no real-world device/
network diversity) — not what Google's Core Web Vitals actually measure
(field data from real Chrome users via CrUX) or even a reliable lab
proxy. The right tool: **Google PageSpeed Insights / Lighthouse CI**
(`lighthouse https://www.jointidywise.com --output=json`) run against the
live URLs, or Google Search Console's Core Web Vitals report for real
field data. `lighthouse-ci` can be wired into the same CI pipeline as this
Playwright suite as a separate job if durable automated tracking is
wanted.

## 14.x — Integrations

**14.1 Gmail OAuth token refresh**, **14.2 OpenPhone sync**, **14.3
Stripe webhooks idempotent**, **14.4 Facebook Lead Ads webhook**, **14.5
Make.com pipeline retries**: these are all about a *third party calling
TidyWise*, not TidyWise's own UI — there's no page for Playwright to
drive. The right tool: **webhook simulation** — replay a captured real
payload (or Stripe CLI's `stripe trigger`/`stripe listen --forward-to`
for 14.3, Meta's Graph API test tools for 14.4) directly at the relevant
edge function URL, then assert on the DB/log side effects. For 14.3
specifically (idempotency), send the **same** webhook event ID twice and
assert only one DB write resulted — that's a request-replay test, not a
browser test.

## 15.3 / 15.4 — Cron

**15.3 blog publisher cron fires on schedule**, **15.4 reminder + payroll
crons fire on schedule**: cron jobs run on Supabase's own scheduler
(`pg_cron` or Supabase's Cron feature), independent of any page load —
there's nothing for Playwright to click. The right tool: **manually
invoke the cron-triggered edge function with the expected `x-cron-secret`
header** (via curl or the Supabase dashboard's "Invoke" button) to prove
the function itself works, then separately **check Supabase's cron job
history / edge function logs** to confirm it's actually scheduled and
firing (`get_logs` via the Supabase MCP, or `SELECT * FROM cron.job_run_details`
if `pg_cron` is in use). 15.3 already has a known-paused flag per the
checklist text ("posts publish (currently paused - verify)") — that's a
config check (is the cron job enabled?), not a functional one.
