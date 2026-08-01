/**
 * Structural guard: a CSS block that overrides a colour token must also
 * override that token's foreground.
 *
 * WHY THIS EXISTS
 * On 2026-08-01, .portal-v2 was found overriding four colour tokens without
 * their foregrounds — --success, --warning, --info and --destructive. Each
 * inherited a foreground from :root that had been chosen against a DIFFERENT
 * colour. In the dark theme every portal semantic is light, so the inherited
 * white sat at 1.76:1, 2.66:1 and 2.97:1 on solid fills.
 *
 * Four defects of one shape, none caught by review, typecheck, build or eye.
 * They were found only because someone measured. The comment left on the alias
 * block afterwards is advice, and advice does not run.
 *
 * So this checks the operation the way the date rule does: it does not care
 * why a block set a colour, only that the pairing travelled with it.
 *
 * WHAT IT CHECKS
 * For every block, for every token X where --X-foreground exists anywhere in
 * the file: if the block changes --X, it must also change --X-foreground.
 *
 * "Changes" includes changing it THROUGH an alias. The first version of this
 * script only looked at direct declarations and passed a tree with three of the
 * four original defects put back — because .dark .portal-v2 never writes
 * --success at all. It writes --pv-success, and .portal-v2 has already said
 * `--success: var(--pv-success)`. The colour on screen changes; the token name
 * never appears. So var() references are followed transitively, in both
 * directions: setting --pv-success counts as setting --success, and setting
 * --pv-ink counts as setting --foreground.
 *
 * Pairs are discovered, not listed — any future --thing/--thing-foreground is
 * covered the day it is written. EXTRA_PAIRS carries the ones that do not
 * follow the suffix convention.
 *
 * OPT-OUT
 * A block may carry `pair-ok --token` in a comment, with a reason. Use it when
 * the inherited foreground is genuinely correct AND measured — not when it is
 * merely untested.
 *
 * Run: node scripts/check-color-pairs.mjs
 */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FILES = ['src/index.css'];

/** Pairs whose foreground does not follow the `-foreground` suffix. */
const EXTRA_PAIRS = {
  background: 'foreground',
  'sidebar-background': 'sidebar-foreground',
  'pv-brand': 'pv-brand-ink',
};

/**
 * Split CSS into blocks, tracking the nested selector path. A regex cannot do
 * this — @media wraps selectors, and the portal's dark values live two deep.
 */
function parseBlocks(css) {
  const blocks = [];
  const stack = [];
  let buf = '';
  let i = 0;

  // Strip comments but remember any `pair-ok` opt-outs by absolute position.
  const optOuts = [];
  let stripped = '';
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const body = css.slice(i + 2, end === -1 ? css.length : end);
      for (const m of body.matchAll(/pair-ok\s+--([a-z0-9-]+)/g)) {
        optOuts.push({ pos: stripped.length, token: m[1] });
      }
      stripped += ' '.repeat((end === -1 ? css.length : end + 2) - i);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    stripped += css[i];
    i += 1;
  }

  const lineAt = (pos) => stripped.slice(0, pos).split('\n').length;

  let start = 0;
  for (i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === '{') {
      stack.push({ sel: buf.trim().replace(/\s+/g, ' '), declStart: i + 1, line: lineAt(i) });
      buf = '';
      start = i + 1;
    } else if (ch === '}') {
      const frame = stack.pop();
      if (frame) {
        // Only leaf-ish blocks carry declarations; nested rules are handled by
        // their own frames, so slice out just this frame's own text.
        blocks.push({
          selector: stack.map((f) => f.sel).concat(frame.sel).join(' '),
          line: frame.line,
          from: frame.declStart,
          to: i,
          text: stripped.slice(frame.declStart, i),
        });
      }
      buf = '';
      start = i + 1;
    } else {
      buf += ch;
    }
  }
  return { blocks, optOuts, lineAt };
}

let failures = 0;
let checked = 0;

for (const rel of FILES) {
  const path = join(ROOT, rel);
  const css = readFileSync(path, 'utf8');
  const { blocks, optOuts } = parseBlocks(css);

  // Vocabulary: every --X that has a --X-foreground somewhere in this file.
  const pairs = new Map(Object.entries(EXTRA_PAIRS));
  for (const m of css.matchAll(/--([a-z0-9-]+)-foreground\s*:/g)) {
    pairs.set(m[1], `${m[1]}-foreground`);
  }
  /*
    The second convention in this file: .pv-chip-* and .pv-soft-* put --X-soft
    behind --X as its text. So a block that moves the pastel must move the ink
    that sits on it. Same failure shape, different suffix — the four defects
    happened because a colour moved and its partner did not.
  */
  for (const m of css.matchAll(/--([a-z0-9-]+)-soft\s*:/g)) {
    pairs.set(`${m[1]}-soft`, m[1]);
  }

  /*
    Alias graph. `--success: var(--pv-success)` means a block that writes
    --pv-success has changed what --success renders as, even though it never
    names it. Inverted here so the closure runs from what a block writes to
    everything that follows from it.
  */
  const affects = new Map(); // token -> tokens whose value depends on it
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    const [, target, value] = m;
    for (const ref of value.matchAll(/var\(\s*--([a-z0-9-]+)/g)) {
      if (!affects.has(ref[1])) affects.set(ref[1], new Set());
      affects.get(ref[1]).add(target);
    }
  }
  const closure = (seeds) => {
    const out = new Set(seeds);
    const queue = [...seeds];
    while (queue.length) {
      for (const next of affects.get(queue.pop()) ?? []) {
        if (!out.has(next)) { out.add(next); queue.push(next); }
      }
    }
    return out;
  };

  for (const block of blocks) {
    // Declarations belonging to THIS block, not to nested ones.
    const own = block.text.replace(/\{[^{}]*\}/g, '');
    const direct = [...own.matchAll(/(?:^|[;{\s])--([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    if (!direct.length) continue;
    const set = closure(direct);

    for (const [base, fg] of pairs) {
      if (!set.has(base)) continue;
      checked += 1;
      if (set.has(fg)) continue;
      const excused = optOuts.some(
        (o) => o.token === base && o.pos >= block.from && o.pos <= block.to,
      );
      if (excused) continue;
      failures += 1;
      console.error(
        `${relative(ROOT, path)}:${block.line}  ${block.selector || '(top level)'}\n` +
          `    changes --${base} but not --${fg}, which is rendered against it.\n` +
          `    The inherited --${fg} was chosen for a different --${base}, so the\n` +
          `    contrast here is unverified. Set it in this block, or add a comment\n` +
          `    "pair-ok --${base}: <measured reason>" if the inherited value is right.\n`,
      );
    }
  }
}

if (failures) {
  console.error(`✖ ${failures} colour token${failures === 1 ? '' : 's'} overridden without its foreground.`);
  process.exit(1);
}
console.log(`✓ colour pairs intact — ${checked} override${checked === 1 ? '' : 's'} checked, each carries its foreground.`);
