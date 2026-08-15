// Broadcast rendering: the two product rules, and the controls that make this
// suite capable of failing.
//
// Runner: node:test. The module is import-free, so Node v24 strips the types
// natively and no bundler is involved:
//
//   node --experimental-strip-types --test src/lib/broadcast-render.test.ts
//
// There is no npm script for this, matching src/lib/phone.test.ts.
//
// TWO CONTROLS ARE DELIBERATE HERE. An implementation that appended the footer
// unconditionally would satisfy every "marketing has a footer" assertion, and
// one that never appended it would satisfy every "transactional has none" —
// so each rule needs its opposite asserted too:
//
//   1. "CONTROL: the two classes differ ONLY by the footer" — kills both the
//      always-append and never-append bugs in one assertion
//   2. "CONTROL: escaping applies to the body, not to our own constant" —
//      kills the over-escaping bug that made the constant unmatchable
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBroadcastInput,
  renderBroadcastHtml,
  renderBroadcastText,
  UNSUBSCRIBE_SENTENCE,
} from './broadcast-render.ts';

const URL_ = 'https://x.test/u?token=abc';

// ─── validateBroadcastInput ────────────────────────────────────────────────

test('message_class has no default — absent is a validation error', () => {
  const r = validateBroadcastInput({ subject: 'Hi', bodyText: 'Body', messageClass: undefined });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('message_class is required'));
});

test('rejects an unknown message_class', () => {
  const r = validateBroadcastInput({ subject: 'Hi', bodyText: 'Body', messageClass: 'promo' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('message_class must be transactional or marketing'));
});

test('accepts a valid transactional input', () => {
  const r = validateBroadcastInput({ subject: 'Hi', bodyText: 'Body', messageClass: 'transactional' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('rejects blank subject and blank body', () => {
  const r = validateBroadcastInput({ subject: '   ', bodyText: '\n', messageClass: 'marketing' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('subject is required'));
  assert.ok(r.errors.includes('body is required'));
});

test('rejects a subject over 200 characters', () => {
  const r = validateBroadcastInput({ subject: 'x'.repeat(201), bodyText: 'B', messageClass: 'marketing' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('subject must be 200 characters or fewer'));
});

// ─── renderBroadcastHtml ───────────────────────────────────────────────────

test('marketing render appends the unsubscribe link; the stored body never contains it', () => {
  const bodyText = 'Two weeks free, on us.';
  const html = renderBroadcastHtml({ bodyText, unsubscribeUrl: URL_ });
  assert.ok(html.includes(URL_));
  assert.ok(html.includes(UNSUBSCRIBE_SENTENCE));
  assert.ok(!bodyText.toLowerCase().includes('unsubscribe'));
});

test('transactional render passes no url and emits no unsubscribe footer', () => {
  const html = renderBroadcastHtml({ bodyText: 'The site is down.', unsubscribeUrl: null });
  assert.ok(!html.includes(UNSUBSCRIBE_SENTENCE));
  assert.ok(!html.toLowerCase().includes('unsubscribe'));
});

test('CONTROL: the two classes differ ONLY by the footer', () => {
  // Kills both degenerate implementations at once: always-append and
  // never-append. The body half must be byte-identical across classes.
  const bodyText = 'Same body, both classes.';
  const tx = renderBroadcastHtml({ bodyText, unsubscribeUrl: null });
  const mk = renderBroadcastHtml({ bodyText, unsubscribeUrl: URL_ });
  assert.notEqual(tx, mk, 'marketing and transactional renders must differ');
  const footerStart = mk.indexOf('<hr');
  assert.ok(footerStart > -1, 'marketing render must carry an <hr> footer');
  assert.equal(
    mk.slice(0, footerStart).trim(),
    tx.slice(0, tx.indexOf('</div>')).trim().replace(/<\/div>$/, '').trim(),
    'the body half must be identical across classes',
  );
});

test('body is HTML-escaped — a broadcast is not an HTML injection vector', () => {
  const html = renderBroadcastHtml({
    bodyText: '<script>alert(1)</script> & "quoted"',
    unsubscribeUrl: null,
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('CONTROL: escaping applies to the body, not to our own constant', () => {
  // UNSUBSCRIBE_SENTENCE contains an apostrophe. Escaping it turns "You're"
  // into "You&#39;re", which still RENDERS correctly but makes the constant
  // unmatchable in the source — and any test asserting the footer contains it
  // can then never pass. Escaping belongs on bodyText and unsubscribeUrl,
  // which are the actual injection surfaces; the constant is compile-time and
  // ours. Both halves are asserted so neither can regress alone.
  const html = renderBroadcastHtml({ bodyText: "it's <b>bold</b>", unsubscribeUrl: URL_ });
  assert.ok(html.includes(UNSUBSCRIBE_SENTENCE), 'our constant must appear verbatim');
  assert.ok(html.includes('&#39;s &lt;b&gt;'), 'the body must still be escaped');
});

test('newlines become paragraphs, not a single run-on line', () => {
  const html = renderBroadcastHtml({ bodyText: 'One\n\nTwo', unsubscribeUrl: null });
  assert.ok(html.includes('One'));
  assert.ok(html.includes('Two'));
  assert.ok((html.match(/<p[ >]/g) ?? []).length >= 2);
});

test('plain-text alternative carries the same unsubscribe url', () => {
  const txt = renderBroadcastText({ bodyText: 'Hello', unsubscribeUrl: URL_ });
  assert.ok(txt.includes('Hello'));
  assert.ok(txt.includes(URL_));
});

// ─── the two-copy invariant ────────────────────────────────────────────────

test('the Deno copy behaves identically', async () => {
  // src/lib/broadcast-render.ts is canonical and tested here; the edge
  // functions run in Deno and cannot import from src/, so
  // supabase/functions/_shared/broadcast-render.ts is a verbatim copy below
  // its header. Same arrangement as phone.ts and automation-templates.
  //
  // THIS TEST FAILS UNTIL THE LOVABLE PASTE IS APPLIED. That is the point: it
  // is the red half of Task 4, and it goes green when the Deno copy lands.
  const shared = await import('../../supabase/functions/_shared/broadcast-render.ts');

  const bodies = ['plain', "it's <b>x</b> & y", 'One\n\nTwo', '', '   '];
  const urls: (string | null)[] = [null, URL_];

  assert.equal(shared.UNSUBSCRIBE_SENTENCE, UNSUBSCRIBE_SENTENCE, 'constant diverges');

  for (const bodyText of bodies) {
    for (const unsubscribeUrl of urls) {
      assert.equal(
        shared.renderBroadcastHtml({ bodyText, unsubscribeUrl }),
        renderBroadcastHtml({ bodyText, unsubscribeUrl }),
        `renderBroadcastHtml diverges on ${JSON.stringify([bodyText, unsubscribeUrl])}`,
      );
      assert.equal(
        shared.renderBroadcastText({ bodyText, unsubscribeUrl }),
        renderBroadcastText({ bodyText, unsubscribeUrl }),
        `renderBroadcastText diverges on ${JSON.stringify([bodyText, unsubscribeUrl])}`,
      );
    }
  }

  for (const messageClass of ['transactional', 'marketing', 'promo', undefined]) {
    assert.deepEqual(
      shared.validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass }),
      validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass }),
      `validateBroadcastInput diverges on ${JSON.stringify(messageClass)}`,
    );
  }
});
