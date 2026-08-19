// Guard against detaching a Supabase client method from its receiver.
//
// Runner: node:test, same as the other colocated suites:
//   node --experimental-strip-types --test src/hooks/useOrgMemberNames.contract.test.ts
//
// WHY THIS EXISTS. This shipped and ran in production for days:
//
//     const callRpc = supabase.rpc as unknown as (...) => ...;
//     const { data, error } = await callRpc('get_org_member_names', {...});
//
// It typechecks. It lints. It is wrong. Pulling `rpc` off the client detaches
// it from its receiver, and supabase-js reads `this.rest` inside rpc(), so the
// call throws "Cannot read properties of undefined (reading 'rest')" BEFORE any
// request is sent. There is no network error and no `error` field to inspect —
// it surfaces as an empty result, which is indistinguishable from a query that
// legitimately returned nothing.
//
// A type cast is what made it invisible: casting the METHOD tells the compiler
// to stop reasoning about the receiver. Casting the CLIENT keeps the call a
// method call and keeps `this`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../', import.meta.url).pathname;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

// Assignment of a supabase client method to a standalone binding, in any of the
// shapes that detach it. Deliberately narrow: `supabase.from(...)` chained
// inline is fine, and so is `const client = supabase`.
const DETACH = /\b(?:const|let|var)\s+\w+\s*=\s*supabase\s*\.\s*(rpc|from|functions|storage|channel)\b/;

/**
 * Comments describe the bad pattern on purpose — the fix in useOrgMemberNames
 * quotes it verbatim so the next reader knows what not to write. Scanning raw
 * text flags that documentation as the defect it warns about, so strip comment
 * lines before matching. Only executable lines can detach anything.
 */
function codeLines(src: string): { line: string; n: number }[] {
  const out: { line: string; n: number }[] = [];
  let inBlock = false;
  src.split('\n').forEach((raw, i) => {
    const t = raw.trim();
    if (inBlock) { if (t.includes('*/')) inBlock = false; return; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return; }
    if (t.startsWith('//') || t.startsWith('*')) return;
    out.push({ line: raw, n: i + 1 });
  });
  return out;
}

test('no file detaches a supabase client method from its receiver', () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const { line, n } of codeLines(src)) {
      if (DETACH.test(line)) offenders.push(`${file.replace(SRC, 'src/')}:${n}  ${line.trim()}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'Detached supabase method(s) — these throw at runtime reading `this`:\n' +
      offenders.join('\n') +
      '\nCast the CLIENT, not the method: `const client = supabase as unknown as {...}`',
  );
});

test('useOrgMemberNames calls rpc as a method, and guards the throw', () => {
  const src = readFileSync(join(SRC, 'hooks/useOrgMemberNames.ts'), 'utf8');
  assert.ok(src.includes('client.rpc('), 'must call rpc as a method on a client object');
  const code = codeLines(src).map((l) => l.line).join('\n');
  assert.ok(!/=\s*supabase\s*\.\s*rpc/.test(code), 'must not assign supabase.rpc to a binding');
  // A throw and a returned `error` are different channels. The bug threw, so the
  // error branch never ran and nothing was logged.
  assert.ok(src.includes('try {'), 'the async body must be wrapped — a throw is not an error field');
  assert.ok(src.includes('catch'), 'and the throw must be caught rather than escaping as a rejection');
});

test('CONTROL: detaching really does lose `this` — the mechanism, not a belief', () => {
  // Without this the regex tests above could pass while the premise is wrong.
  const client = {
    rest: 'the-transport',
    rpc(this: { rest: string } | undefined) {
      return this!.rest;   // exactly what supabase-js does internally
    },
  };

  assert.equal(client.rpc(), 'the-transport');           // method call: `this` is the client

  const detached = client.rpc;
  assert.throws(
    () => detached(),                                     // detached: `this` is undefined
    /Cannot read properties of undefined|undefined is not an object/,
    'detaching must throw on `this` — if it does not, this whole suite is moot',
  );
});
