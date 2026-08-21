#!/usr/bin/env node
/**
 * Every var(--pv-*) referenced from src/ must be defined in index.css.
 *
 * Why this exists: `--pv-card` was referenced in 14 places across 10 files and
 * has never been defined — the token is `--pv-surface`. An undefined custom
 * property does not throw, warn, or fall back; `hsl(var(--pv-card))` is simply
 * an invalid colour, so the background silently does not paint. On a dev state
 * bar that is invisible. On the 5a sign-in form card it removed the white card
 * the whole screen is built around, and nothing anywhere reported it.
 *
 * This is the same failure family as the .portal-v2 scope bug: a token that
 * resolves to nothing looks exactly like a design decision.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CSS = 'src/index.css';
const css = readFileSync(CSS, 'utf8');

/* Left-hand sides: `--pv-foo:` anywhere in the stylesheet, any scope. */
const defined = new Set([...css.matchAll(/(--pv-[a-z0-9-]+)\s*:/g)].map(m => m[1]));

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(p)) files.push(p);
  }
})('src');

const bad = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--pv-[a-z0-9-]+)/g)) {
      if (!defined.has(m[1])) bad.push({ f, line: i + 1, token: m[1] });
    }
  });
}

if (bad.length) {
  console.error(`✗ ${bad.length} reference(s) to undefined --pv-* token(s):\n`);
  for (const b of bad) console.error(`   ${b.f}:${b.line}  ${b.token}`);
  console.error(`\n   Defined tokens live in ${CSS}. An undefined custom property`);
  console.error('   paints nothing — it does not fall back and does not warn.');
  process.exit(1);
}
console.log(`✓ --pv-* tokens intact — ${defined.size} defined, every reference resolves.`);
