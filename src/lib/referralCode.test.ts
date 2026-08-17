// Referral code generation and normalisation.
//
// Runner: node:test. The module is import-free, so Node v24 strips the types
// natively and no bundler is involved:
//
//   node --experimental-strip-types --test src/lib/referralCode.test.ts
//
// There is no npm script for this, matching phone.test.ts and
// automationTemplates.speedToLead.test.ts.
//
// TWO CONTROLS ARE DELIBERATE. A normaliser that collapsed every input to one
// value would satisfy every "these are the same" assertion below — and every
// signup would then resolve to the same referrer, silently paying one org for
// everyone else's referrals:
//
//   1. "a different code stays distinct"   — kills collapse-to-constant
//   2. "distinct seeds give distinct codes" — kills a generator returning a
//      fixed string, which would make every org share one code
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReferralCode, generateReferralCode } from './referralCode.ts';

// ─── normalisation: what a human might type or paste ────────────────────────

test('every plausible way of typing one code produces one key', () => {
  const forms = [
    'ABC23456',
    'abc23456',
    ' abc23456 ',
    'abc-23456',
    'abc 23456',
    'ABC-234-56',
  ];
  const keys = new Set(forms.map((f) => normalizeReferralCode(f)));
  assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(', ')}`);
  assert.equal([...keys][0], 'ABC23456');
});

test('CONTROL: a different code stays distinct', () => {
  // Without this, a normaliser returning a constant passes the test above and
  // every referral in the system would attribute to whichever org matched.
  assert.notEqual(normalizeReferralCode('ABC23456'), normalizeReferralCode('ABC23457'));
  assert.notEqual(normalizeReferralCode('ABC23456'), normalizeReferralCode('XYZ98765'));
});

test('unusable input has no code', () => {
  for (const bad of [null, undefined, '', '   ', '---', '   -- ']) {
    assert.equal(normalizeReferralCode(bad), null, `${JSON.stringify(bad)} should have no code`);
  }
});

test('normalisation is idempotent', () => {
  // The edge function normalises on lookup and the client normalises on entry.
  // Running it twice must not change the answer.
  const once = normalizeReferralCode(' abc-23456 ');
  assert.equal(normalizeReferralCode(once), once);
});

// ─── generation ─────────────────────────────────────────────────────────────

test('generated codes avoid characters that are misread aloud', () => {
  // O/0 and I/1 are the classic confusions when a code is read over the phone
  // or copied off a screen. Excluding them is why we do not just slice a uuid.
  for (let i = 0; i < 200; i++) {
    const code = generateReferralCode(`org-${i}`);
    assert.doesNotMatch(code, /[O0I1]/, `code ${code} contains an ambiguous character`);
  }
});

test('generated codes survive their own normaliser unchanged', () => {
  // If generation could emit a character normalisation strips, the stored code
  // would never match what a user typed back.
  for (let i = 0; i < 200; i++) {
    const code = generateReferralCode(`org-${i}`);
    assert.equal(normalizeReferralCode(code), code, `${code} is not normalisation-stable`);
  }
});

test('CONTROL: distinct seeds give distinct codes', () => {
  // A generator returning a fixed string would pass both tests above. Every org
  // would then share one code and attribution would be meaningless.
  const seeds = Array.from({ length: 500 }, (_, i) => `org-${i}`);
  const codes = new Set(seeds.map(generateReferralCode));
  assert.equal(codes.size, seeds.length, `expected 500 distinct codes, got ${codes.size}`);
});

test('generation is deterministic for a seed', () => {
  // Minting is keyed on organization_id, so re-running it must be idempotent
  // rather than issuing a second code for the same org.
  assert.equal(generateReferralCode('org-abc'), generateReferralCode('org-abc'));
});

test('codes are a fixed, readable length', () => {
  for (const seed of ['a', 'org-1', 'a-very-long-organization-identifier-uuid-like']) {
    assert.equal(generateReferralCode(seed).length, 8);
  }
});
