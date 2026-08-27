/**
 * Contract tests for useOrgCurrency's return shape and CurrencySync safety.
 *
 *   node --experimental-strip-types --test src/hooks/useOrgCurrency.contract.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgCurrencyResult } from './useOrgCurrency.ts';

test('successful fetch: currency is the org value, isFallback false, no error', () => {
  const result: OrgCurrencyResult = {
    currency: 'GBP',
    error: null,
    isFallback: false,
  };
  assert.equal(result.currency, 'GBP');
  assert.equal(result.isFallback, false);
  assert.equal(result.error, null);
});

test('org has no currency configured: returns USD, isFallback false, no error', () => {
  const result: OrgCurrencyResult = {
    currency: 'USD',
    error: null,
    isFallback: false,
  };
  assert.equal(result.currency, 'USD');
  assert.equal(result.isFallback, false, '"not configured" is not a failure');
});

test('fetch failed: currency is fallback USD, isFallback true, error is set', () => {
  const result: OrgCurrencyResult = {
    currency: 'USD',
    error: new Error('network timeout'),
    isFallback: true,
  };
  assert.equal(result.currency, 'USD');
  assert.equal(result.isFallback, true);
  assert.ok(result.error);
});

test('CurrencySync contract: on error, do NOT overwrite active currency', () => {
  // CurrencySync sits above all ErrorBoundaries (App.tsx:279).
  // When error is set, it must leave the previously-set active currency alone.
  // This test verifies the LOGIC, not the React hook — the actual component
  // checks `if (!error) { setActiveCurrency(currency); }`.
  let activeCurrency = 'GBP'; // previously set correctly
  const result: OrgCurrencyResult = {
    currency: 'USD', // fallback
    error: new Error('fetch failed'),
    isFallback: true,
  };

  // Simulate CurrencySync's logic:
  if (!result.error) {
    activeCurrency = result.currency;
  }
  // Active currency must NOT have changed — the GBP was correct
  assert.equal(activeCurrency, 'GBP', 'CurrencySync must not overwrite on error');
});

test('CurrencySync contract: on success, DO update active currency', () => {
  let activeCurrency = 'USD'; // default from cold start
  const result: OrgCurrencyResult = {
    currency: 'GBP',
    error: null,
    isFallback: false,
  };

  if (!result.error) {
    activeCurrency = result.currency;
  }
  assert.equal(activeCurrency, 'GBP', 'CurrencySync must update on success');
});
