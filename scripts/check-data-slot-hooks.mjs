/**
 * Structural guard: every [data-slot="X"] the stylesheet targets must be
 * emitted by some component.
 *
 * WHY THIS EXISTS
 * On 2026-08-20 four rules in index.css were narrowed from broad ARIA-role
 * selectors to [data-slot="tabs-list"] / [data-slot="tabs-trigger"], and the
 * attributes were added to src/components/ui/tabs.tsx.
 *
 * That file is shadcn's. Lovable regenerates ui/ components, and a regenerated
 * tabs.tsx would not carry the attributes — at which point the portal's tab
 * styling silently stops applying. Nothing errors. Nothing looks broken enough
 * to notice in review. Tabs simply revert to the default look on 30 screens.
 *
 * A CSS selector that matches nothing is invisible, which is exactly why it
 * needs a check rather than a comment.
 *
 * WHAT IT CHECKS
 * Every data-slot value appearing in a selector in src/index.css must appear as
 * a `data-slot="..."` attribute somewhere under src/. It does not care which
 * file emits it — only that the hook the stylesheet depends on still exists.
 *
 * The reverse is deliberately NOT checked: a component may carry a data-slot
 * the stylesheet does not use yet.
 *
 * Run: node scripts/check-data-slot-hooks.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS = join(ROOT, 'src/index.css');

const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const wanted = new Set(
  [...css.matchAll(/\[data-slot=["']([^"']+)["']\]/g)].map((m) => m[1]),
);

if (!wanted.size) {
  console.log('✓ data-slot hooks: none targeted by the stylesheet.');
  process.exit(0);
}

/** Where each slot is emitted, if anywhere. */
const found = new Map([...wanted].map((s) => [s, []]));

const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/data-slot=["']([^"']+)["']/g)) {
        if (found.has(m[1])) found.get(m[1]).push(relative(ROOT, p));
      }
    }
  }
};
walk(join(ROOT, 'src'));

const orphans = [...found].filter(([, files]) => files.length === 0);

if (orphans.length) {
  console.error(
    `✖ ${orphans.length} data-slot hook${orphans.length === 1 ? '' : 's'} ` +
      `targeted by src/index.css ${orphans.length === 1 ? 'is' : 'are'} not emitted by any component:\n`,
  );
  for (const [slot] of orphans) {
    console.error(`    [data-slot="${slot}"]`);
  }
  console.error(
    '\n  The stylesheet is styling something that no longer exists, so those' +
      '\n  rules now match nothing and the component has silently lost its' +
      '\n  styling. This usually means a shadcn component under src/components/ui/' +
      '\n  was regenerated and dropped the attribute. Re-add it rather than' +
      '\n  widening the selector back to an ARIA role — see §10 of' +
      '\n  docs/mobile-design-spec.md for why it was narrowed.\n',
  );
  process.exit(1);
}

const summary = [...found]
  .map(([slot, files]) => `${slot} (${new Set(files).size})`)
  .join(', ');
console.log(`✓ data-slot hooks intact — ${summary}.`);
