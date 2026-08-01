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

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FILES = ['src/index.css'];

/*
  ─── Part 2: does the pairing actually WORK ────────────────────────────────
  Part 1 proves a pairing travelled. That is not the same as it being legible,
  and the bug that started all of this proves the gap: --warning was bright gold
  on white at 1.65:1. The pairing existed. It was declared in the same block as
  its foreground. Part 1 would have passed it every time.

  So the ratios are computed here, from the HSL already in the file.

  THRESHOLDS
    4.5:1  a foreground on its own fill, and any token used as text, measured
           against --background and --card (which is how the aliases get used)
    3:1    tokens that are only ever a border or an icon

  ROLES ARE MEASURED, NOT DECLARED. Which tier a token lands in comes from
  grepping the TSX for `text-x` / `bg-x` / `border-x`, because a token's role is
  what the components do with it, not what its name suggests. --accent sounds
  like a text colour and resolves to a surface inside .portal-v2.
*/

/** sRGB relative luminance, per WCAG 2.x. Input is an [h, s%, l%] triple. */
function luminance([h, s, l]) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][
    Math.floor(h / 60) % 6
  ].map((v) => v + m);
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The four ways this app renders. A token's value depends on which of these
 * you are in — .portal-v2 is applied by 71 pages, so "the app's colour" and
 * ":root's colour" are different questions.
 */
/*
  KNOWN, MEASURED, NOT YET FIXED.

  Adding the ratio maths surfaced nine pre-existing failures in :root/.dark —
  the base theme, which governs everything Radix portals to document.body
  (dialogs, toasts, dropdowns, popovers) since those render outside .portal-v2.

  They are listed rather than fixed because each needs a decision, not a nudge:
  dark --destructive fails its white foreground AND text-on-card in OPPOSITE
  directions, so it cannot be solved by moving lightness — the foreground has to
  flip. Dark --primary is the same, and flipping it turns every primary button's
  label from white to near-black across 355 call sites. That is a visible
  repaint, and it is the owner's call, not a side effect of adding a checker.

  This list is not a mute button:
    - anything NOT on it fails the build, so regressions still bite
    - anything ON it that starts passing ALSO fails the build, so the list
      cannot quietly rot after the underlying value is fixed
    - every entry prints on every run
*/
const KNOWN = new Set([
  // Was nine. The three light-mode --destructive entries came off when that
  // token went 55% -> 45%: there, white-on-red and red-on-white moved the same
  // way, so lightness alone fixed both sides. The six below do not have that
  // property — each fails in two directions at once and needs its foreground
  // flipped, which is a visible repaint rather than a nudge.
  'light|--accent-foreground on bg-accent',
  'dark|--primary-foreground on bg-primary',
  'dark|--destructive-foreground on bg-destructive',
  'dark|text-destructive on --card',
  'dark|text-info on --background',
  'dark|text-info on --card',
]);

/** Tokens that ARE surfaces — they are what text sits on, so they are not text. */
const SURFACES = new Set(['background', 'card', 'popover']);

const SCOPES = {
  light: [':root'],
  dark: [':root', '.dark'],
  'portal light': [':root', '.portal-v2'],
  'portal dark': [':root', '.dark', '.portal-v2', '.dark .portal-v2'],
};

/** Every Tailwind class prefix that puts a token somewhere on screen. */
function measureRoles() {
  const seen = { text: new Set(), bg: new Set(), edge: new Set() };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
        const src = readFileSync(p, 'utf8');
        // (?![\w-]) so `text-muted` does not match inside `text-muted-foreground`
        for (const m of src.matchAll(/\b(text|bg|border|fill|stroke|ring)-([a-z][a-z0-9-]*)(?![\w-])/g)) {
          const bucket = m[1] === 'text' ? 'text' : m[1] === 'bg' ? 'bg' : 'edge';
          seen[bucket].add(m[2]);
        }
      }
    }
  };
  walk(join(ROOT, 'src'));
  return seen;
}

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
/** Pair vocabulary, hoisted so Part 2 can measure the same pairs Part 1 enforces. */
const allPairs = new Map();

for (const rel of FILES) {
  const path = join(ROOT, rel);
  const css = readFileSync(path, 'utf8');
  const { blocks, optOuts } = parseBlocks(css);

  // Vocabulary: every --X that has a --X-foreground somewhere in this file.
  const pairs = allPairs;
  for (const [k, v] of Object.entries(EXTRA_PAIRS)) pairs.set(k, v);
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

// ─── Part 2: the ratios ──────────────────────────────────────────────────────
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const roles = measureRoles();

const scopeBlocks = [];
{
  const stack = [];
  let buf = '';
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') { stack.push({ sel: buf.trim().replace(/\s+/g, ' '), s: i + 1 }); buf = ''; }
    else if (ch === '}') {
      const f = stack.pop();
      if (f) {
        /*
          At-rule frames are dropped from the selector path. :root and .dark live
          inside `@layer base`, so composing the raw path gave "@layer base :root",
          which matched no scope — the light and dark scopes silently resolved to
          nothing and every ratio in them went unchecked. The red-green run caught
          it: restoring the original gold --warning did not fail.
        */
        const path = stack.filter((x) => !x.sel.startsWith('@')).map((x) => x.sel);
        if (!f.sel.startsWith('@')) path.push(f.sel);
        scopeBlocks.push({ sel: path.join(' '), text: css.slice(f.s, i) });
      }
      buf = '';
    } else buf += ch;
  }
}
const declsFor = (sel) => {
  const out = {};
  for (const b of scopeBlocks) {
    if (b.sel !== sel) continue;
    for (const m of b.text.replace(/\{[^{}]*\}/g, '').matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[m[1]] = m[2].trim();
    }
  }
  return out;
};
/** Resolve a token to an [h,s,l] triple in a given scope, following var() chains. */
const value = (env, token, seen = new Set()) => {
  const raw = env[token];
  if (raw === undefined || seen.has(token)) return null;
  seen.add(token);
  const alias = raw.match(/^var\(\s*--([a-z0-9-]+)\s*\)$/);
  if (alias) return value(env, alias[1], seen);
  const hsl = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  return hsl ? [+hsl[1], +hsl[2], +hsl[3]] : null;
};

let low = 0;
let ratios = 0;
let iconTier = 0;
let stale = 0;
const knownSeen = [];
const report = (scope, label, r, bar) => {
  ratios += 1;
  const key = `${scope}|${label}`;
  if (r >= bar) {
    if (KNOWN.has(key)) {
      stale += 1;
      console.error(`  ${scope.padEnd(13)} ${r.toFixed(2).padStart(5)}:1  now PASSES — remove from KNOWN: ${label}`);
    }
    return;
  }
  if (KNOWN.has(key)) { knownSeen.push(`  ${scope.padEnd(13)} ${r.toFixed(2).padStart(5)}:1  ${label}`); return; }
  low += 1;
  console.error(`  ${scope.padEnd(13)} ${r.toFixed(2).padStart(5)}:1  (needs ${bar})  ${label}`);
};

for (const [scope, sels] of Object.entries(SCOPES)) {
  const env = {};
  for (const s of sels) Object.assign(env, declsFor(s));

  for (const [base, fg] of allPairs) {
    const c = value(env, base);
    if (!c) continue;

    // A foreground only has to work if something actually fills with this token.
    if (roles.bg.has(base)) {
      const f = value(env, fg);
      if (f) report(scope, `--${fg} on bg-${base}`, contrast(f, c), 4.5);
    }

    // Used as text? Then it must hold against the surfaces it lands on.
    //
    // SURFACES are excluded from this tier, because a surface is not text. They
    // do appear behind `text-`: `bg-muted-foreground text-background` is an
    // inverse pill, and --background there is deliberately the same colour as
    // the page. Measuring it against --card would only ever restate that.
    //
    // The limit this leaves: it cannot see WHICH background a `text-` class
    // actually landed on, only that the token is used as text somewhere. So an
    // inverse token misapplied to a card is a component bug this will not
    // catch. Every non-surface token is still checked against both surfaces,
    // which is what caught --accent.
    if (roles.text.has(base) && !SURFACES.has(base)) {
      for (const surface of ['background', 'card']) {
        if (base === surface) continue;
        const s = value(env, surface);
        if (s) report(scope, `text-${base} on --${surface}`, contrast(c, s), 4.5);
      }
    } else if (roles.edge.has(base) && !roles.bg.has(base)) {
      // Border/icon only — a 3:1 object, not text.
      iconTier += 1;
      for (const surface of ['background', 'card']) {
        const s = value(env, surface);
        if (s) report(scope, `border/icon --${base} on --${surface}`, contrast(c, s), 3);
      }
    }
  }
}

if (knownSeen.length) {
  console.log(`⚠ ${knownSeen.length} known contrast failures in the base theme, not yet fixed:`);
  for (const l of knownSeen) console.log(l);
  console.log('  (see KNOWN in scripts/check-color-pairs.mjs — each needs a foreground flip, not a nudge)');
}
if (stale) console.error(`✖ ${stale} KNOWN entr${stale === 1 ? 'y' : 'ies'} now pass and must be deleted.`);
if (failures || low || stale) {
  if (failures) console.error(`✖ ${failures} colour token${failures === 1 ? '' : 's'} overridden without its foreground.`);
  if (low) console.error(`✖ ${low} pairing${low === 1 ? '' : 's'} below its contrast threshold.`);
  process.exit(1);
}
console.log(
  `✓ colour pairs intact — ${checked} overrides carry their foreground; ` +
    `${ratios} contrast ratios pass across ${Object.keys(SCOPES).length} scopes.` +
    (iconTier === 0 ? '\n  (3:1 icon/border tier implemented but currently unpopulated — every token in use is text or a fill.)' : ''),
);
