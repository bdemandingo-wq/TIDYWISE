// The senders must SELECT every column the renderer reads.
//
// Runner: node:test, same as broadcast-render.test.ts:
//   node --experimental-strip-types --test src/lib/broadcast-senders.contract.test.ts
//
// WHY THIS EXISTS, and why it is a source-text assertion rather than a
// behavioural one: broadcast-dispatch fetches the broadcast row with an
// explicit column list. Add a render input, wire it through the compose form,
// the preview and the test send — and forget that one string — and PostgREST
// returns a row without the field. `b.signature_text` is then `undefined`,
// which every renderer here treats as "no signature" and renders happily.
//
// The result is the worst failure shape this feature can produce: the preview
// shows the signature, the test send to yourself shows the signature, and the
// real blast to every owner goes out without it. Nothing throws, nothing logs,
// and it is only observable after the irreversible part.
//
// These files run in Deno and talk to a live database, so they cannot be
// imported and exercised from here. The column list is a string literal, and a
// string literal is exactly what a string assertion can guard.
//
// THIS TEST IS RED UNTIL THE LOVABLE PASTE LANDS. That is deliberate, and the
// same convention broadcast-render.test.ts used for its own Deno copy: the
// senders live in supabase/functions, which deploys from Lovable rather than
// from this repo, so the red half ships first and goes green on deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Every column of `broadcasts` that a renderer reads. Extend this when a
 * render input is added and the test will name whichever sender forgot it.
 */
const RENDER_COLUMNS = ['body_text', 'message_class', 'signature_text'];

const SENDERS = [
  { name: 'broadcast-dispatch', path: '../../supabase/functions/broadcast-dispatch/index.ts' },
  { name: 'broadcast-admin', path: '../../supabase/functions/broadcast-admin/index.ts' },
];

/** Every `.select("...")` string literal in a source file. */
function selectLists(source: string): string[] {
  return [...source.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
}

for (const sender of SENDERS) {
  test(`${sender.name} selects every column the renderer reads`, () => {
    const source = readFileSync(new URL(sender.path, import.meta.url), 'utf8');
    const lists = selectLists(source);
    assert.ok(lists.length > 0, `no .select("...") found in ${sender.name} — did the file move?`);

    // "Some single select carries all of them", not "the columns appear
    // somewhere in the file". A sender that fetched body_text in one query and
    // signature_text in an unrelated one would satisfy the weaker check while
    // still rendering from an incomplete row.
    const satisfying = lists.filter((list) => {
      const cols = list.split(',').map((c) => c.trim());
      return RENDER_COLUMNS.every((needed) => cols.includes(needed));
    });

    assert.ok(
      satisfying.length > 0,
      `${sender.name} has no single .select() carrying all of [${RENDER_COLUMNS.join(', ')}].\n` +
        `Selects found:\n${lists.map((l) => `  .select("${l}")`).join('\n')}`,
    );
  });
}

test('CONTROL: the checker actually fails when a column is missing', () => {
  // Without this, a broken selectLists() regex returning [] would make the
  // assertions above vacuous in the passing direction on some future refactor.
  const fake = '.select("id, body_text, message_class")';
  const lists = selectLists(fake);
  assert.deepEqual(lists, ['id, body_text, message_class']);
  const cols = lists[0].split(',').map((c) => c.trim());
  assert.equal(RENDER_COLUMNS.every((n) => cols.includes(n)), false, 'must reject a list missing signature_text');
});
