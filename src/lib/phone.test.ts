// Phone normalisation: the two functions, and the controls that make this
// suite capable of failing.
//
// Runner: node:test. Both modules are import-free, so Node v24 strips the
// types natively and no bundler is involved:
//
//   node --experimental-strip-types --test src/lib/phone.test.ts
//
// There is no npm script for this, matching automationTemplates.speedToLead.test.ts.
//
// THREE CONTROLS ARE DELIBERATE HERE. A normaliser that collapsed every input
// to one value would satisfy every "these are the same" assertion in this file,
// and a dedupe built on it would suppress every second SMS forever:
//
//   1. "a different number stays distinct"  — kills the collapse-to-constant bug
//   2. "matches the previous implementation" — proves the marketing-guard
//      refactor is a no-op, using the OLD body as a reference oracle
//   3. "never emits a malformed address"     — kills the "+", "+5551234" class
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneMatchKey, toE164 } from './phone.ts';

// ─── phoneMatchKey: the dedupe key ──────────────────────────────────────────

test('every written form of one number produces one key', () => {
  const forms = [
    '+1 (813) 555-1234',
    '813-555-1234',
    '8135551234',
    '18135551234',
    '+18135551234',
    ' (813) 555 1234 ',
    '813.555.1234',
  ];
  const keys = new Set(forms.map((f) => phoneMatchKey(f)));
  assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(', ')}`);
  assert.equal([...keys][0], '8135551234');
});

test('CONTROL: a different number stays distinct', () => {
  // Without this, a phoneMatchKey that returned a constant would pass every
  // other assertion above — and the dedupe would suppress every lead's SMS
  // after the first one, forever.
  assert.notEqual(phoneMatchKey('813-555-1234'), phoneMatchKey('813-555-1235'));
  assert.notEqual(phoneMatchKey('8135551234'), phoneMatchKey('9545551234'));
  // Differing only in the digit the last-10 rule discards must STILL collapse:
  // +1 and bare are the same person.
  assert.equal(phoneMatchKey('18135551234'), phoneMatchKey('8135551234'));
});

test('too few digits has no key', () => {
  for (const bad of ['555-1234', '405252227', '12345', '']) {
    assert.equal(phoneMatchKey(bad), null, `${bad} should have no key`);
  }
});

test('null and undefined have no key', () => {
  assert.equal(phoneMatchKey(null), null);
  assert.equal(phoneMatchKey(undefined), null);
});

test('CONTROL: matches the previous marketing-guard implementation exactly', () => {
  // Reference oracle — the body currently living privately inside
  // supabase/functions/_shared/marketing-guard.ts, copied verbatim. Task 2
  // deletes that copy and imports phoneMatchKey instead. This asserts the
  // swap is a no-op rather than asking anyone to take it on trust.
  const previousImplementation = (phone: string | null | undefined): string | null => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.slice(-10);
  };

  const corpus = [
    // shapes taken from the live leads table
    '+1 813-971-2700',
    ' (868) 478-0426',
    '8135551234',
    '18135551234',
    '405252227',
    '0409206947',
    '61475442420',
    '+610459046970',
    '',
    null,
    undefined,
    'not a phone',
    '+++',
    '00000000000',
  ];

  for (const input of corpus) {
    assert.equal(
      phoneMatchKey(input),
      previousImplementation(input),
      `divergence on ${JSON.stringify(input)}`,
    );
  }
});

// ─── toE164: the send address ───────────────────────────────────────────────

test('NANP numbers become +1 E.164', () => {
  assert.equal(toE164('813-555-1234'), '+18135551234');
  assert.equal(toE164('(813) 555-1234'), '+18135551234');
  assert.equal(toE164('18135551234'), '+18135551234');
  assert.equal(toE164('+1 813-971-2700'), '+18139712700');
  // Trinidad & Tobago is inside the NANP.
  assert.equal(toE164(' (868) 478-0426'), '+18684780426');
});

test('the lengths the old inline code turned into garbage are now null', () => {
  // notify-new-lead:219-221 only guarded the 10-digit case, so each of these
  // was handed to OpenPhone as a malformed "to" address.
  assert.equal(toE164('405252227'), null); //   9 digits -> was "+405252227"
  assert.equal(toE164('555-1234'), null); //    7 digits -> was "+5551234"
  assert.equal(toE164(''), null); //            0 digits -> was "+"
  assert.equal(toE164(null), null);
  assert.equal(toE164(undefined), null);
});

test('an area or exchange code that cannot exist is rejected, not prefixed', () => {
  // 10 digits, but NANP forbids a leading 0 or 1 in either code. The old code
  // prefixed a "1" and produced "+10409206947", which is not a real number.
  // These are Australian mobiles in national format and cannot be repaired
  // here — there is no country code to infer.
  assert.equal(toE164('0409206947'), null);
  assert.equal(toE164('0470206963'), null);
  assert.equal(toE164('1135551234'), null);
});

test('numbers that already carry a non-NANP country code pass through', () => {
  // These WORK under the current inline code and must keep working: the length
  // check means no "1" is prepended, so they reach OpenPhone as valid E.164.
  // Narrowing to NANP-only would have silently stopped texting this org.
  assert.equal(toE164('61475442420'), '+61475442420');
  assert.equal(toE164('+610459046970'), '+610459046970');
  assert.equal(toE164('447911123456'), '+447911123456');
});

test('CONTROL: never emits a malformed address', () => {
  // The failure this whole function exists to prevent. Every non-null return
  // must be a plausible E.164 string: "+", 8-15 digits, no leading zero.
  const corpus = [
    '813-555-1234', '18135551234', '+1 813-971-2700', ' (868) 478-0426',
    '405252227', '555-1234', '', '0409206947', '61475442420',
    '+610459046970', '447911123456', 'not a phone', '+++', '1', '00000000000',
    '999999999999999999',
  ];
  for (const input of corpus) {
    const out = toE164(input);
    if (out === null) continue;
    assert.match(out, /^\+[1-9]\d{7,14}$/, `${JSON.stringify(input)} produced ${out}`);
  }
});

test('CONTROL: a different number never shares a send address', () => {
  assert.notEqual(toE164('813-555-1234'), toE164('813-555-1235'));
});

// ─── the KEEP IN SYNC pair ──────────────────────────────────────────────────

test('the Deno copy behaves identically', async () => {
  // src/lib/phone.ts is canonical and tested here; the senders run in Deno and
  // cannot import from src/, so supabase/functions/_shared/phone.ts is a
  // verbatim copy below its header. Same arrangement as automation-templates.
  //
  // THIS TEST FAILS UNTIL THE LOVABLE PASTE IS APPLIED. That is the point: it
  // is the red half of Task 1, and it goes green when the Deno copy lands.
  const shared = await import('../../supabase/functions/_shared/phone.ts');

  const corpus = [
    '+1 (813) 555-1234', '813-555-1234', '18135551234', ' (868) 478-0426',
    '405252227', '0409206947', '61475442420', '+610459046970', '', 'nope',
  ];

  for (const input of corpus) {
    assert.equal(
      shared.phoneMatchKey(input),
      phoneMatchKey(input),
      `phoneMatchKey diverges on ${JSON.stringify(input)}`,
    );
    assert.equal(
      shared.toE164(input),
      toE164(input),
      `toE164 diverges on ${JSON.stringify(input)}`,
    );
  }
});
