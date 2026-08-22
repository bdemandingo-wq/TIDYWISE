#!/usr/bin/env node
/**
 * Warns when a mobile arm offers fewer KINDS of interactive control than the
 * desktop branch of the same page.
 *
 * This is the check that would have caught Notifications and Tasks before a
 * device did. Both were swapped to a wired body that rendered a read-only
 * list, and both silently lost the screen's primary action:
 *
 *   Notifications  desktop had Switches (presets, delivery channels);
 *                  the arm had none. You could not turn a channel off.
 *   Tasks          desktop had TabsTriggers (Daily/Weekly/Monthly/Notes)
 *                  and checkboxes; the arm had neither. You could read your
 *                  tasks but not tick one off.
 *
 * ── How it looks ──────────────────────────────────────────────────────
 *
 * For a page with an `if (isMobile)` early return it compares control kinds
 * in the DESKTOP branch against the arm PLUS every *MobileBody file the page
 * imports — because the arm usually renders `<XMobileBody />` and the controls
 * live in that file, not in the arm.
 *
 * Tabs are matched loosely on purpose: desktop uses <TabsTrigger>, the mobile
 * bodies use <SegmentedTabs>. Those are the same affordance and should not be
 * reported as a difference.
 *
 * ── Warning, not failing ──────────────────────────────────────────────
 *
 * A missing control is not always a defect. Tracking has no map on the phone
 * by choice; some screens genuinely should be simpler. So this reports and
 * exits 0. Promote it to failing once it has run clean for a while — the
 * exit code is the only line that needs to change.
 *
 * Silence a deliberate omission with a comment anywhere in the page file:
 *
 *     // mobile-control-allow: Switch — the phone shows briefs only, by design
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const KINDS = {
  /* `toggle` and `select` are this codebase's row-level controls: ListRow
     renders a Switch for one and a Checkbox for the other. A body that passes
     either HAS that control, even though the element lives in ListRow rather
     than in the body file — so count the prop as evidence. Without this the
     check reports Checklists and Inventory, which do have them. */
  Switch: [/<Switch[\s/>]/, /\btoggle[:=]/],
  Checkbox: [/<Checkbox[\s/>]/, /\bselectable[:=]/, /\bselect=\{/],
  Select: [/<Select[\s/>]/, /<SelectTrigger[\s/>]/],
  /* Desktop draws tabs with TabsTrigger; the wired bodies use SegmentedTabs.
     Same affordance — counting them separately would report every swapped
     screen as broken. */
  Tabs: [/<TabsTrigger[\s/>]/, /<SegmentedTabs[\s/>]/],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

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

function has(text, patterns) {
  return patterns.some((re) => re.test(text));
}

/** Resolve `@/pages/admin/XWiredPage` to a file on disk. */
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = resolve('src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const ext of ['.tsx', '.ts']) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

const findings = [];

for (const file of walk('src/pages')) {
  const src = readFileSync(file, 'utf8');
  const range = armRange(src);
  if (!range) continue;

  const [start, end] = range;
  const arm = src.slice(start, end);
  const desktop = src.slice(0, start) + src.slice(end);

  /* The arm's controls include everything in the bodies it renders. */
  let mobileText = arm;
  for (const m of src.matchAll(/import \{([^}]*MobileBody[^}]*)\} from '([^']+)'/g)) {
    const target = resolveImport(m[2], file);
    if (target) mobileText += '\n' + readFileSync(target, 'utf8');
  }

  /* …and everything in components DEFINED IN THIS FILE that the arm mounts.
     Several pages declare their dialog as a sibling function further down, so
     its controls sit in what looks like the desktop half while the arm renders
     it perfectly well. Recurring's Active switch lives in exactly that shape. */
  for (const m of arm.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
    const name = m[1];
    const defRe = new RegExp(`function ${name}\\(`);
    const at = src.search(defRe);
    if (at === -1) continue;
    /* Take the rest of the file from that definition — coarse, but it only
       ever ADDS evidence that a control is reachable, never removes it. */
    mobileText += '\n' + src.slice(at);
  }

  for (const [kind, patterns] of Object.entries(KINDS)) {
    if (!has(desktop, patterns)) continue;
    if (has(mobileText, patterns)) continue;
    if (new RegExp(`mobile-control-allow:\\s*${kind}\\b`).test(src)) continue;
    findings.push({ file, kind });
  }
}

if (findings.length > 0) {
  console.warn('⚠ mobile control parity — desktop offers controls the phone does not:\n');
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f.kind);
  }
  for (const [file, kinds] of byFile) {
    console.warn(`  ${file}`);
    console.warn(`    desktop has ${kinds.join(', ')}; the mobile arm has none.\n`);
  }
  console.warn(
    'If that is deliberate, record it in the page file:\n' +
    '  // mobile-control-allow: Switch — reason\n' +
    'Otherwise the phone has lost a control the desktop screen offers.\n' +
    '(Warning only for now.)\n',
  );
} else {
  console.log('✓ mobile control parity — no screen offers fewer control kinds on a phone.');
}

/* Warning, not failing — see the header. */
process.exit(0);
