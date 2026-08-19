// The shared email validator and recipient splitter.
//   node --experimental-strip-types --test src/lib/emailAddress.test.ts
//
// Lives in src/lib so it runs with the other suites, but imports the module
// from supabase/functions/_shared, which is where the edge functions can reach
// it — same arrangement broadcast-render.test.ts uses for its Deno copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, parseRecipients } from '../../supabase/functions/_shared/email-address.ts';

test('the value that started this: a phone number welded onto a TLD', () => {
  // Passed the old /^[^\s@]+@[^\s@]+\.[^\s@]+$/ and was stored as a customer's
  // email in February. Every booking confirmation to them failed silently.
  assert.equal(isValidEmail('chefbschrank@gmail.com+15615830771'), false);
  assert.equal(isValidEmail('chefbschrank@gmail.com'), true);
});

test('a comma in place of the dot is rejected', () => {
  assert.equal(isValidEmail('Valdez@gmail,com'), false);
  assert.equal(isValidEmail('Valdez@gmail.com'), true);
});

test('the TLD must be letters — this is the anchor the old regex lacked', () => {
  assert.equal(isValidEmail('a@b.c'), false, 'single-letter TLD');
  assert.equal(isValidEmail('a@b.com123'), false, 'trailing digits');
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('a@b.museum'), true);
});

test('obvious non-addresses', () => {
  for (const bad of ['', '   ', 'n/a', 'none', 'not-an-email', '@nolocal.com', 'nodomain@', 'two@@at.com']) {
    assert.equal(isValidEmail(bad), false, `${JSON.stringify(bad)} must be rejected`);
  }
});

test('non-strings are rejected rather than thrown on', () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.equal(isValidEmail(bad), false);
  }
});

// ─── parseRecipients ───────────────────────────────────────────────────────

test('a comma-separated field becomes multiple recipients', () => {
  assert.deepEqual(
    parseRecipients('accounts@openarms.test, maria@openarms.test'),
    ['accounts@openarms.test', 'maria@openarms.test'],
  );
});

test('whitespace around parts is trimmed, empties dropped', () => {
  assert.deepEqual(
    parseRecipients('  a@x.com ,, b@y.com  ,'),
    ['a@x.com', 'b@y.com'],
  );
});

test('a bad part is DROPPED, the good ones still send', () => {
  // The whole point. The old behaviour failed the entire send, so a list with
  // one typo delivered to nobody.
  assert.deepEqual(
    parseRecipients('good@x.com, garbage, alsogood@y.com'),
    ['good@x.com', 'alsogood@y.com'],
  );
});

test('a single plain address is unchanged — the common case must not regress', () => {
  assert.deepEqual(parseRecipients('one@x.com'), ['one@x.com']);
});

test('an array input is flattened and split too', () => {
  assert.deepEqual(
    parseRecipients(['a@x.com, b@y.com', 'c@z.com']),
    ['a@x.com', 'b@y.com', 'c@z.com'],
  );
});

test('duplicates collapse', () => {
  // Some providers reject the whole message when `to` repeats an address.
  assert.deepEqual(parseRecipients('a@x.com, a@x.com'), ['a@x.com']);
});

test('an all-garbage field yields [] rather than a malformed recipient', () => {
  assert.deepEqual(parseRecipients('garbage, nonsense'), []);
  assert.deepEqual(parseRecipients(''), []);
  assert.deepEqual(parseRecipients(null), []);
});

test('CONTROL: the OLD regex accepted what this one rejects', () => {
  // If this ever fails, the anchor has been loosened back and the February bug
  // is representable again.
  const OLD = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const value = 'chefbschrank@gmail.com+15615830771';
  assert.equal(OLD.test(value), true, 'the old regex passed it');
  assert.equal(isValidEmail(value), false, 'the new one must not');
});
