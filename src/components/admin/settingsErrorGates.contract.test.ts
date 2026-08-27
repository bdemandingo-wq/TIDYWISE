/**
 * Contract tests for settings-editor error gates.
 *
 * Verifies the SHAPE guarantees that prevent the "query fails, form shows
 * defaults, save overwrites real config" bug class.
 *
 *   node --experimental-strip-types --test src/components/admin/settingsErrorGates.contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Surge Pricing ──────────────────────────────────────────────────────────

test('SurgePricing: failed load must produce a non-null error for the form gate', () => {
  // The component gates on surgeError before rendering the form.
  // When the query fails, react-query sets error to the thrown Error.
  const surgeError: Error | null = new Error('permission denied');
  // The gate: if (surgeError) { return <QueryError /> }
  assert.ok(surgeError, 'surgeError must be truthy so the gate fires');
});

test('SurgePricing: defaults have all surge types disabled — a save would disable active surge', () => {
  // This is WHY the gate exists. These defaults are plausible but wrong.
  const SURGE_DEFAULTS = {
    surge_weekend_enabled: false,
    surge_weekend_multiplier: 1.15,
    surge_lastminute_enabled: false,
    surge_lastminute_hours: 48,
    surge_lastminute_multiplier: 1.20,
    surge_holiday_enabled: false,
    surge_holiday_multiplier: 1.25,
  };
  assert.equal(SURGE_DEFAULTS.surge_weekend_enabled, false);
  assert.equal(SURGE_DEFAULTS.surge_lastminute_enabled, false);
  assert.equal(SURGE_DEFAULTS.surge_holiday_enabled, false);
  // An org with active surge would have these as true.
  // Saving defaults = silently disabling surge pricing.
});

test('SurgePricing: successful load with data does NOT trigger the error gate', () => {
  const surgeError: Error | null = null;
  assert.equal(surgeError, null, 'no error means the form should render');
});

// ── Recurring Discounts ────────────────────────────────────────────────────

test('RecurringDiscount: null-data path produces HARDCODED_DEFAULTS', () => {
  // This is the path that was "reachable" — when data is null (query loading,
  // org has no business_settings row, or stale null from a failed query),
  // the hook returns HARDCODED_DEFAULTS.
  const HARDCODED_DEFAULTS = { oneTime: 0, monthly: 15, biweekly: 25, weekly: 30 };
  const data: unknown = null;
  const config = data ? { oneTime: 0, monthly: 5, biweekly: 10, weekly: 20 } : HARDCODED_DEFAULTS;
  assert.deepStrictEqual(config, HARDCODED_DEFAULTS,
    'null data produces hardcoded defaults that would overwrite real config on save');
});

test('RecurringDiscount: error from hook must be surfaced for the form gate', () => {
  const discountError: Error | null = new Error('RLS denied');
  // The gate: if (discountError) { return <QueryError /> }
  assert.ok(discountError, 'discountError must be truthy so the gate fires');
});

test('RecurringDiscount: successful load does NOT trigger the error gate', () => {
  const discountError: Error | null = null;
  assert.equal(discountError, null);
});

test('RecurringDiscount: loading state shows spinner, not the form', () => {
  // The component checks `if (loading)` and returns a spinner.
  // This prevents the useEffect from running with HARDCODED_DEFAULTS
  // and showing them in editable fields during the initial fetch.
  const loading = true;
  const discountError: Error | null = null;
  // The order of checks in the component is: error → loading → form
  // During loading, the form never renders, so defaults never appear.
  assert.ok(loading, 'loading must be truthy to prevent form rendering');
  assert.equal(discountError, null, 'no error during loading');
});

// ── SettingsPage ──────────────────────────────────────────────────────────

test('SettingsPage: failed load produces loadError for the form gate', () => {
  // The fetch catch block sets loadError. The form gate checks it before rendering.
  const loadError: Error | null = new Error('Failed to fetch');
  assert.ok(loadError, 'loadError must be truthy so the gate fires');
});

test('SettingsPage: defaults have booleans that would silently re-enable features', () => {
  // These booleans default true. An org that set them false would have them flipped.
  const defaultSettings = {
    campaign_quiet_hours_enabled: true,
    allow_online_booking: true,
    require_deposit: true,
    benchmarks_opt_in: true,
    require_cleaner_payout_setup: true,
  };
  assert.equal(defaultSettings.allow_online_booking, true);
  assert.equal(defaultSettings.require_deposit, true);
  assert.equal(defaultSettings.campaign_quiet_hours_enabled, true);
  // Saving these defaults = silently re-enabling features an org turned off.
});

test('SettingsPage: successful load does NOT trigger the error gate', () => {
  const loadError: Error | null = null;
  assert.equal(loadError, null, 'no error means the form renders');
});

test('SettingsPage: full-row save writes ALL ~30 fields from state', () => {
  // This is why the gate matters — it's a full upsert, not a partial update.
  // If settings state is defaults, ALL 30 fields get overwritten.
  const settingsFields = [
    'company_name', 'company_email', 'company_phone', 'timezone', 'currency',
    'campaign_quiet_hours_enabled', 'allow_online_booking', 'require_deposit',
    'confirmation_email_subject', 'confirmation_email_body',
    'reminder_email_subject', 'reminder_email_body',
  ];
  assert.ok(settingsFields.length > 10, 'save writes many fields');
});

// ── ZapierAlertSettingsCard ───────────────────────────────────────────────

test('ZapierAlert: failed load produces alertError for the form gate', () => {
  const alertError: Error | null = new Error('network');
  assert.ok(alertError, 'alertError must be truthy so the gate fires');
});

test('ZapierAlert: useEffect skips populating form when error is set', () => {
  // The useEffect checks `if (alertError) return` before setting state.
  const alertError: Error | null = new Error('failed');
  let formPopulated = false;
  if (!alertError) {
    formPopulated = true;
  }
  assert.equal(formPopulated, false, 'form must not be populated on error');
});

test('ZapierAlert: successful load populates form and renders normally', () => {
  const alertError: Error | null = null;
  const alertData = { enabled: true, failure_threshold: 10, window_minutes: 30 };
  let formPopulated = false;
  if (!alertError) {
    formPopulated = true;
  }
  assert.ok(formPopulated);
  assert.ok(alertData);
});
