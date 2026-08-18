// Runner: node:test, matching src/lib/phone.test.ts. There is no npm script.
//
//   node --experimental-strip-types --test src/lib/emailFailureClassification.test.ts
//
// THE CONTROL THIS FILE EXISTS FOR. Widening "hard failure" is the easy half.
// The half that can go wrong quietly is alarming orgs whose fallback WORKED —
// their customers got the email, and a banner saying otherwise trains them to
// ignore it, which costs more than the bug being fixed.
//
// There is currently no live org in that state: every fell_back_to='resend'
// row in the window turned out to be a compound failure. So the
// successful-fallback case is pinned here as a fixture instead of being
// observed, and it stays pinned after the live data moves on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isHardFailure,
  classifyCause,
  dominantCause,
  FALLBACK_ALSO_FAILED_MARKER,
} from './emailFailureClassification.ts';

// ─── isHardFailure ──────────────────────────────────────────────────────────

test('no fallback attempted is a hard failure', () => {
  assert.equal(isHardFailure({ fell_back_to: null, error_message: 'API key is invalid' }), true);
});

test('CONTROL: a fallback that SUCCEEDED is not a hard failure', () => {
  // Exactly what send-org-email logs on its success path: fell_back_to set,
  // error_message carrying only the primary's error. The customer got it.
  assert.equal(
    isHardFailure({
      fell_back_to: 'resend',
      error_message: 'Gmail failed (535: 5.7.8 Username and Password not accepted)',
    }),
    false,
  );
});

test('CONTROL: a successful platform fallback is not a hard failure', () => {
  // weekly-business-report writes this on a SUCCESSFUL send via the platform
  // sender. It must never raise a banner.
  assert.equal(
    isHardFailure({
      fell_back_to: 'platform',
      error_message: 'weekly report sent via platform sender: org_send_failed',
    }),
    false,
  );
});

test('a fallback that ALSO failed is a hard failure', () => {
  assert.equal(
    isHardFailure({
      fell_back_to: 'resend',
      error_message:
        'Gmail failed (No valid emails provided!); Resend fallback also failed: Invalid `to` field',
    }),
    true,
  );
});

test('the marker constant is the one actually matched', () => {
  assert.ok(
    isHardFailure({
      fell_back_to: 'resend',
      error_message: `Gmail failed (x); ${FALLBACK_ALSO_FAILED_MARKER}: y`,
    }),
  );
});

test('a null error message with a fallback is treated as delivered', () => {
  // No evidence of a second failure. Fail quiet rather than alarm.
  assert.equal(isHardFailure({ fell_back_to: 'resend', error_message: null }), false);
});

// ─── classifyCause ──────────────────────────────────────────────────────────

test('classifyCause picks the domain over gmail in a compound message', () => {
  assert.equal(
    classifyCause(
      'Gmail failed (535 Username and Password not accepted); Resend fallback also failed: ' +
        'The charlestoncleanroutine.com domain is not verified.',
    ),
    'unverified_domain',
  );
});

test('classifyCause recognises an invalid key', () => {
  assert.equal(classifyCause('API key is invalid'), 'invalid_key');
});

test('classifyCause recognises a gmail auth rejection', () => {
  assert.equal(
    classifyCause('Gmail failed (535: 5.7.8 Username and Password not accepted)'),
    'gmail_auth',
  );
});

// ─── dominantCause ──────────────────────────────────────────────────────────

test('dominantCause returns the cause when every row agrees', () => {
  const rows = [
    { fell_back_to: null, error_message: 'API key is invalid' },
    { fell_back_to: null, error_message: 'API key is invalid' },
  ];
  assert.equal(dominantCause(rows), 'invalid_key');
});

test('CONTROL: dominantCause returns null when causes are mixed', () => {
  // A specific remedy here would name the wrong fix for half the failures.
  const rows = [
    { fell_back_to: null, error_message: 'API key is invalid' },
    { fell_back_to: null, error_message: 'The example.com domain is not verified' },
  ];
  assert.equal(dominantCause(rows), null);
});

test('dominantCause returns null for an empty list and for unknown causes', () => {
  assert.equal(dominantCause([]), null);
  assert.equal(dominantCause([{ fell_back_to: null, error_message: 'something odd' }]), null);
});
