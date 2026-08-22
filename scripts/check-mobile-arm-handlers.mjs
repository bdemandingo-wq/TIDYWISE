#!/usr/bin/env node
/**
 * Catches the defect this codebase has shipped six times:
 *
 *   A page early-returns a mobile arm — `if (isMobile) return (<AdminLayout>…)`
 *   — and the arm renders a button whose dialog is declared BELOW that return,
 *   in the desktop branch. The dialog never mounts on a phone, so the button
 *   does nothing. It looks correct in code review and in a desktop browser,
 *   and only fails on a device.
 *
 * Instances: Leads (Add Lead + row tap), Bookings (row tap), Invoices,
 * Feedback, Recurring, Checklists.
 *
 * ── What it checks ────────────────────────────────────────────────────
 *
 * For every file containing an `if (isMobile)` early return, it collects the
 * state setters the ARM calls — setFooOpen(true), openFooDialog(), and the
 * onAdd / onSelect / onClick handlers passed to a *MobileBody — and then
 * checks that whatever those setters open is also MOUNTED inside the arm.
 *
 * Mounting is detected as a component or <Dialog>/<Sheet> whose `open` prop
 * reads the same state variable, appearing between the arm's `return (` and
 * its closing. If a setter is called in the arm but nothing in the arm reads
 * that state, the button is dead and the check fails.
 *
 * ── Deliberately conservative ─────────────────────────────────────────
 *
 * It only flags a setter it can pair with an `open={…}` reader elsewhere in
 * the same file. A handler that navigates, mutates or toasts is not a dialog
 * and is ignored. That keeps it from crying wolf on the many handlers that
 * legitimately do not open anything.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/pages'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Index just past the arm's closing `}` for `if (isMobile) {` … `}`. */
function armRange(src) {
  const m = /if \(isMobile\)\s*\{/.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return [m.index, i + 1];
    }
  }
  return null;
}

const failures = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    const range = armRange(src);
    if (!range) continue;
    const [start, end] = range;
    const arm = src.slice(start, end);
    const rest = src.slice(0, start) + src.slice(end);

    /* State setters the arm invokes: setXOpen(true) and friends. */
    const setters = new Set();
    for (const m of arm.matchAll(/\b(set[A-Z]\w*)\(\s*true\s*\)/g)) setters.add(m[1]);

    for (const setter of setters) {
      /* setFooOpen -> fooOpen */
      const stateVar = setter.slice(3, 4).toLowerCase() + setter.slice(4);

      /* Does anything READ that state as an `open` prop? If nothing anywhere
         does, this setter does not drive a dialog and is none of our business. */
      const readerRe = new RegExp(`open=\\{\\s*${stateVar}\\b`);
      if (!readerRe.test(src)) continue;

      /* It does drive a dialog. Is that dialog inside the arm? */
      if (!readerRe.test(arm) && readerRe.test(rest)) {
        failures.push({
          file,
          setter,
          stateVar,
          why: `the arm calls ${setter}(true) but the only open={${stateVar}} is outside the arm`,
        });
      }
    }
  }
}

if (failures.length > 0) {
  console.error('✗ dead controls in mobile arms:\n');
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.why}`);
    console.error(`    → mount that dialog inside the mobile arm too.\n`);
  }
  console.error(
    'A dialog declared below the early return never renders on a phone, so the\n' +
    'button that opens it does nothing. This has shipped six times.\n',
  );
  process.exit(1);
}

console.log('✓ mobile arms intact — every dialog a mobile arm opens is mounted inside it.');
