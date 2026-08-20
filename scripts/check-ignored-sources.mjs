/**
 * Structural guard: no file under src/ may be git-ignored.
 *
 * WHY THIS EXISTS
 * On 2026-08-19 a new page was written to src/pages/preview/, imported from
 * App.tsx, and routed. It worked locally, typechecked, built, and was verified
 * in a running browser. It was never in the repository.
 *
 * .gitignore carried an unanchored `preview/`, commented "Local email preview
 * output". An unanchored directory pattern matches at ANY depth, so it also
 * matched src/pages/preview/. `git add -A src/` skipped the file silently, and
 * `git status` hides ignored files by design, so nothing anywhere said no.
 *
 * What shipped was a lazy import and two routes pointing at a file that did
 * not exist. The build that mattered was not the local one — it was Lovable's,
 * from a clean checkout, where the import was genuinely dead. Lovable removed
 * it, correctly, and the route 404'd in production with zero trace of why.
 *
 * The local build could not have caught this. It passed BECAUSE the file was
 * present on the machine that wrote it. Only a check that asks git what it is
 * actually tracking can see the gap.
 *
 * WHAT IT CHECKS
 * `git ls-files --others --ignored --exclude-standard src/` lists files that
 * exist on disk under src/ and are excluded by some ignore rule. That set
 * should always be empty. It does not parse imports, so it cannot drift out of
 * step with the module graph, and it catches the whole class rather than the
 * one instance: any source file any rule excludes, imported or not.
 *
 * Untracked-and-ignored is exactly the dangerous set, and the only one worth
 * checking: a TRACKED file is in the repository by definition, so it is present
 * in a clean checkout no matter what the ignore rules say. (Git stops applying
 * a directory pattern once the directory holds a tracked file, which is why the
 * original trap could only fire on a brand-new directory.)
 *
 * At the time of writing it returns nothing, so this went green on its first
 * run against the real tree — which is the only reason a guard survives.
 *
 * RED-GREEN: verified by restoring the unanchored `preview/` rule and adding an
 * untracked src/components/preview/Widget.tsx — the check exits 1 and names both
 * the file and `.gitignore:26:preview/`. Restoring the anchor returns it to 0.
 *
 * Run: node scripts/check-ignored-sources.mjs
 */

import { execFileSync } from 'node:child_process';

let out = '';
try {
  out = execFileSync(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', 'src/'],
    { encoding: 'utf8' },
  );
} catch (err) {
  // Not a git checkout (some CI images, some sandboxes). Nothing to verify,
  // and failing the build over it would be worse than the bug.
  console.log('✓ ignored-sources: skipped — not a git working tree');
  process.exit(0);
}

const ignored = out.split('\n').map((l) => l.trim()).filter(Boolean);

if (ignored.length) {
  console.error(
    `✖ ${ignored.length} file${ignored.length === 1 ? '' : 's'} under src/ ${
      ignored.length === 1 ? 'is' : 'are'
    } git-ignored:\n`,
  );
  for (const f of ignored) {
    let rule = '';
    try {
      rule = execFileSync('git', ['check-ignore', '-v', f], { encoding: 'utf8' })
        .trim()
        .split('\t')[0];
    } catch {
      /* check-ignore exits non-zero when nothing matches; leave rule blank */
    }
    console.error(`    ${f}${rule ? `\n        excluded by ${rule}` : ''}`);
  }
  console.error(
    '\n  These exist on your disk and will NOT exist in a clean checkout.' +
      '\n  Anything importing them builds here and breaks there.' +
      '\n  Fix the ignore rule — anchor it with a leading slash if it was' +
      '\n  meant for one directory — rather than force-adding the file.\n',
  );
  process.exit(1);
}

console.log('✓ no src/ file is git-ignored.');
