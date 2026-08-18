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
  MAX_SIGNATURE,
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

// ─── signature ─────────────────────────────────────────────────────────────

test('the signature appears in BOTH classes, unlike the unsubscribe footer', () => {
  const signature = 'Emmanuel\nTidyWise';
  for (const unsubscribeUrl of [null, URL_]) {
    const html = renderBroadcastHtml({ bodyText: 'Body', unsubscribeUrl, signature });
    assert.ok(html.includes('Emmanuel'), `signature missing for url=${unsubscribeUrl}`);
    assert.ok(html.includes('TidyWise'), `signature missing for url=${unsubscribeUrl}`);
  }
});

test('CONTROL: the signature is byte-identical across classes', () => {
  // The failure this kills is wiring the signature off `unsubscribeUrl` — the
  // parameter that legitimately IS marketing-only. Do that and the signature
  // silently becomes marketing-only too, which no assertion above would catch
  // because each class still renders "correctly" on its own.
  const signature = 'Emmanuel\nTidyWise';
  const tx = renderBroadcastHtml({ bodyText: 'Body', unsubscribeUrl: null, signature });
  const mk = renderBroadcastHtml({ bodyText: 'Body', unsubscribeUrl: URL_, signature });
  const footerStart = mk.indexOf('<hr');
  assert.ok(footerStart > -1, 'marketing render must carry an <hr> footer');
  // lastIndexOf, not indexOf. The signature block is itself a <div>, so the
  // FIRST '</div>' is now the signature's own closing tag rather than the
  // wrapper's — the older CONTROL test above gets away with indexOf only
  // because it passes no signature. Slicing at the first close silently
  // compared two truncated strings and reported a difference that was not
  // there.
  assert.equal(
    mk.slice(0, footerStart).trim(),
    tx.slice(0, tx.lastIndexOf('</div>')).trim(),
    'signature must render identically in both classes',
  );
});

test('the signature sits ABOVE the unsubscribe rule, not below it', () => {
  const html = renderBroadcastHtml({
    bodyText: 'Body',
    unsubscribeUrl: URL_,
    signature: 'Emmanuel',
  });
  assert.ok(html.indexOf('Emmanuel') < html.indexOf('<hr'), 'signature must precede the <hr>');
});

test('the signature is escaped — it is compose-form input, not a constant we own', () => {
  // UNSUBSCRIBE_SENTENCE is deliberately emitted unescaped because this module
  // owns it. The signature is typed by a human into a form, so it gets the same
  // treatment as bodyText. The cost is that it cannot carry its own markup.
  const html = renderBroadcastHtml({
    bodyText: 'Body',
    unsubscribeUrl: null,
    signature: '<script>alert(1)</script> & "q"',
  });
  assert.ok(!html.includes('<script>'), 'raw script tag survived into the signature');
  assert.ok(html.includes('&lt;script&gt;'), 'signature must be escaped');
  assert.ok(html.includes('&amp;'), 'ampersand must be escaped');
});

test('an absent, blank or whitespace-only signature emits nothing at all', () => {
  const plain = renderBroadcastHtml({ bodyText: 'Body', unsubscribeUrl: null });
  for (const signature of [undefined, null, '', '   ', '\n\n']) {
    assert.equal(
      renderBroadcastHtml({ bodyText: 'Body', unsubscribeUrl: null, signature }),
      plain,
      `blank signature ${JSON.stringify(signature)} must not change the output`,
    );
  }
});

test('plain-text carries the signature, ordered body then signature then unsubscribe', () => {
  const text = renderBroadcastText({
    bodyText: 'Body',
    unsubscribeUrl: URL_,
    signature: 'Emmanuel',
  });
  assert.ok(text.indexOf('Body') < text.indexOf('Emmanuel'), 'signature must follow the body');
  assert.ok(text.indexOf('Emmanuel') < text.indexOf('---'), 'signature must precede the separator');
  const noUrl = renderBroadcastText({ bodyText: 'Body', unsubscribeUrl: null, signature: 'Emmanuel' });
  assert.equal(noUrl, 'Body\n\nEmmanuel');
});

test('a signature over the cap is a validation error; absent is not', () => {
  const over = validateBroadcastInput({
    subject: 'S', bodyText: 'B', messageClass: 'transactional',
    signature: 'x'.repeat(MAX_SIGNATURE + 1),
  });
  assert.equal(over.ok, false);
  assert.ok(over.errors.some((e) => e.includes('signature')), 'must name the field');

  const absent = validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass: 'transactional' });
  assert.equal(absent.ok, true, 'a broadcast with no signature is valid');

  const atCap = validateBroadcastInput({
    subject: 'S', bodyText: 'B', messageClass: 'transactional',
    signature: 'x'.repeat(MAX_SIGNATURE),
  });
  assert.equal(atCap.ok, true, 'exactly at the cap is allowed — off-by-one guard');
});

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
  // The signature dimension is not decoration. This test only catches drift on
  // inputs it actually exercises — it is a behavioural comparison, not a digest
  // of the two files — so an unexercised parameter is an unguarded one. Absent,
  // null, blank, whitespace-only, multi-line and escaping-sensitive are the
  // shapes where two hand-copied implementations realistically diverge.
  const signatures: (string | null | undefined)[] = [
    undefined,
    null,
    '',
    '   ',
    'Emmanuel',
    'Emmanuel\nTidyWise\nsupport@tidywisecleaning.com',
    'Emmanuel\n\nTidyWise',
    "O'Brien & <Sons>",
  ];

  assert.equal(shared.UNSUBSCRIBE_SENTENCE, UNSUBSCRIBE_SENTENCE, 'constant diverges');
  assert.equal(shared.MAX_SIGNATURE, MAX_SIGNATURE, 'MAX_SIGNATURE diverges');

  for (const bodyText of bodies) {
    for (const unsubscribeUrl of urls) {
      for (const signature of signatures) {
        const where = JSON.stringify([bodyText, unsubscribeUrl, signature]);
        assert.equal(
          shared.renderBroadcastHtml({ bodyText, unsubscribeUrl, signature }),
          renderBroadcastHtml({ bodyText, unsubscribeUrl, signature }),
          `renderBroadcastHtml diverges on ${where}`,
        );
        assert.equal(
          shared.renderBroadcastText({ bodyText, unsubscribeUrl, signature }),
          renderBroadcastText({ bodyText, unsubscribeUrl, signature }),
          `renderBroadcastText diverges on ${where}`,
        );
      }
    }
  }

  for (const messageClass of ['transactional', 'marketing', 'promo', undefined]) {
    for (const signature of [undefined, '', 'ok', 'x'.repeat(MAX_SIGNATURE + 1)]) {
      assert.deepEqual(
        shared.validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass, signature }),
        validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass, signature }),
        `validateBroadcastInput diverges on ${JSON.stringify([messageClass, signature])}`,
      );
    }
  }
});
