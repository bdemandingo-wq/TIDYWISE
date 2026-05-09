## Goal
Add global currency and timezone support across the app. Replace all hardcoded `$` and UTC assumptions with org-level preferences, set during onboarding and editable in settings.

## Current State
- Timezone: already partially supported via `business_settings.timezone` and `useOrgTimezone` hook (default `America/New_York`). Many components already use `formatInTimezone` / `getDateInTimezone`. Some still don't.
- Currency: not supported at all. Hardcoded `$` and `.toFixed(2)` / `toLocaleString()` in dozens of files (e.g. `ProfitMarginReport.tsx`, KPI cards, invoices, booking cards, charge modals).
- Onboarding: `OnboardingPage.tsx` exists but does not collect currency/timezone.

## Scope of Changes

### 1. Database (migration)
- Add `currency` column (text, default `'USD'`) to `business_settings`.
- Ensure `timezone` column exists (it does).
- No RLS changes — table already org-scoped.

### 2. New shared infrastructure
- `src/lib/currency.ts` — currency catalog (USD, GBP, EUR, CAD, AUD, NZD, ZAR, AED, SGD, CHF, JPY, MXN, INR) with code, symbol, locale, and `formatCurrency(amount, code, { showCode? })` using `Intl.NumberFormat`.
- `src/hooks/useOrgCurrency.ts` — mirrors `useOrgTimezone`, reads `business_settings.currency`, defaults to `'USD'`.
- `src/lib/timezones.ts` — full IANA timezone list (use `Intl.supportedValuesOf('timeZone')` at runtime + curated fallback).

### 3. Settings UI
- Extend the business settings page with two searchable comboboxes:
  - Currency (shows symbol + code + name)
  - Timezone (shows IANA name + current offset)
- Save to `business_settings`.

### 4. Onboarding
- Add a first step (or merge into existing first step) that:
  - Auto-detects `Intl.DateTimeFormat().resolvedOptions().timeZone` and browser locale → suggested currency.
  - Lets the user confirm/override.
  - Writes to `business_settings` before proceeding.

### 5. Replace hardcoded `$` site-wide
Sweep all components and use `formatCurrency(amount, currency)` from the new helper. High-traffic targets:
- `ProfitMarginReport.tsx` (KPI cards, table, CSV export)
- `ReportsPage.tsx`
- `BookingsPage.tsx`, `BookingActionSheet.tsx`, booking cards
- Invoice components and PDFs
- Charge / refund modals (`StripeCardForm`, payment dialogs)
- Pricing fields in `ServicesPage`, `EstimatesPage`
- Cleaner earnings, payroll
- Dashboard KPI cards

For PDFs/emails generated server-side (edge functions), pass currency as a parameter from the client OR have edge functions read `business_settings.currency` for the org.

### 6. Replace UTC / browser-local time usage
Audit components that still use raw `new Date()` / `format()` without `useOrgTimezone`. Update to use `formatInTimezone` / `getDateInTimezone` / `getLocalDateInTimezone`. Booking time pickers must interpret picker time in org timezone (already partly handled via `selectedDateTimeToUTCISO`).

"Today" logic for KPIs / same-day cancellations must call `getDateInTimezone(new Date(), tz)` instead of `new Date().toDateString()`.

### 7. Edge functions
Update outbound emails/SMS/invoices that include money to format with the org's currency (read from `business_settings`). At minimum: invoice send, payment receipt, cancellation, deposit, tip.

## Technical Notes
- `Intl.NumberFormat(localeForCurrency, { style: 'currency', currency: code })` handles symbol, decimals, and grouping.
- For ambiguous symbols ($, £ in CAD/AUD/NZD/MXN), append code: `formatCurrency(x, 'CAD', { showCode: true })` → `CA$190.00 CAD` or use `currencyDisplay: 'code'` for forms.
- Timezone dropdown: prefer `Intl.supportedValuesOf('timeZone')` (modern browsers) — group by region for UX.
- Default org currency on existing rows = `'USD'` (back-compat).
- Loading state: while `useOrgCurrency` resolves, render with `'USD'` placeholder to avoid flicker — same pattern as `useOrgTimezone`.

## Out of Scope
- Multi-currency per booking (org-wide currency only).
- Currency conversion / FX rates.
- Per-user (vs per-org) currency — kept at org level to match existing timezone pattern.
- Stripe charge currency change (Stripe accounts have their own currency; we display in org currency but Stripe will still charge in account currency — flagged as future work if mismatch).

## Rollout Order
1. Migration: add `currency` column.
2. Build helpers + hooks (`currency.ts`, `useOrgCurrency`, `timezones.ts`).
3. Settings page: currency + timezone pickers.
4. Onboarding: auto-detect + confirm step.
5. Sweep frontend hardcoded `$` → `formatCurrency`.
6. Sweep "today"/UTC date logic.
7. Update edge functions for invoices/receipts.
8. QA pass on bookings, reports, invoices, charge flow in a non-USD org.

## Estimated Surface
~60–80 files touched in the frontend sweep, ~5–8 edge functions, 1 migration.
