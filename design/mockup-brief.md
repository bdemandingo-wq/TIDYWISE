# Mobile mockup-matching brief

The source of truth is `design/mockups/TidyWise-Mockups.html` (also `TidyWise_Mockups_dc.html`) —
76 screens as real HTML/CSS. Read spacing, radii, font weights and sizes out of that markup rather
than eyeballing a screenshot. Comp ids (`4c`, `7g`, `10a`, ...) are section ids in that file and are
the canonical name for each screen.

## What matching means

Match the layout, order, spacing, type scale and every element the comp shows. Where the comp shows
something that does not exist yet, build it — wired to the real data and the real handlers desktop
uses, never to stubs.

## Judgement rules

1. A comp reproducing a limitation is not a spec. If the comp shows a degraded or buggy version of
   something the app already does better, keep the better behaviour and say so in your report.
2. Where the comp is silent, follow the surrounding app conventions.
3. Every control must WORK, not merely render. Every button opens its real dialog, every toggle
   writes and persists, every tab switches to real content, every row opens what it should.

## Hard constraints

- **Colour**: `--pv-*` tokens only. The comps' blue `#2B5CE6` is wrong — translate it. No raw hex.
- **Desktop must not change.** Every page renders desktop and mobile from one file; only the mobile
  arm changes. Screenshot each screen at 1280px before and after and confirm the desktop table,
  toolbar and layout are identical. Anything in a shared component must be gated behind the
  codebase's `useIsMobile` hook.
- `src/components/portal-v2/` is shared — check every consumer before changing it, and change it
  additively (new optional props) only.
- **Money**: a failed read renders an em-dash, never `$0.00`.
- Dialogs a mobile arm opens must be MOUNTED INSIDE that mobile arm — mounting them only under the
  desktop return is the single most common defect in this work, and it produces buttons that look
  fine and do nothing.

## Verify, don't assume

For each screen, at 390px and 1280px: render it, screenshot it, compare against the comp, and click
every control. Use short Playwright timeouts. In headless Chromium close dialogs with a real
close/cancel click rather than Escape, and re-query a kebab trigger after each dialog closes.
Never restart the dev server (http://localhost:8080) — if it refuses connections, poll until it
answers.

Never trigger real side effects during verification: no real SMS or email sends, no campaign sends,
no staff deletions. Confirm the dialog opens, then cancel.

## Guards (run all of these before reporting)

```sh
node scripts/check-pv-tokens.mjs
node scripts/check-mobile-arm-handlers.mjs
node scripts/check-mobile-control-parity.mjs
node scripts/check-color-pairs.mjs
npx tsc --noEmit -p tsconfig.app.json   # slow; the -p flag is NOT optional
```

`check-color-pairs` has one known base-theme contrast failure; that one is expected.

## Report format

- Per screen: what matched, what you changed, and what you clicked with the observed result.
- Anything you could not verify, stated plainly as unverified.
- Guard results, each one named with its outcome.
- Any divergence from the comp you chose deliberately, with the reason.

## Browser recipe (sandbox-specific — use exactly this)

Playwright's bundled Chromium is missing system libraries in this sandbox and will fail with
`libglib-2.0.so.0: cannot open shared object file`. Do NOT try to install it or fetch libs with
`nix build` — that burns the whole budget. Use the system browser instead:

```python
b = await p.chromium.launch(headless=True, executable_path="/bin/chromium", args=["--no-sandbox"])
```

Confirmed working. Restore the Supabase session (see LOVABLE_BROWSER_AUTH_STATUS and the cookie /
localStorage restore snippet) BEFORE navigating to a /dashboard route, or you land on /login.

### Logged-in session helper

Routes under /dashboard redirect to /login unless the Supabase session is restored. A working
helper already exists — use it, do not roll your own:

```python
import sys; sys.path.insert(0, "/tmp/browser")
from pwsetup import session          # launches /bin/chromium + restores the session

async with session(width=390) as (page, browser):
    await page.goto("http://localhost:8080/dashboard/staff", wait_until="domcontentloaded")
    await page.wait_for_timeout(6000)   # the app hydrates and fetches before content appears
```

Verified: renders the real Staff page as an authenticated admin. Use `session(width=1280)` for
desktop checks.

### Clicking Radix menus/dialogs in headless

Use Playwright's `locator.click()` (it auto-scrolls). Raw `page.mouse.click(x, y)` silently misses
any control below the fold, which reads as a "dead control" that is really a harness mistake. If a
kebab appears inert, first check the trigger exists: `page.locator('button[aria-haspopup="menu"]')`
— a count of 0 means the trigger component isn't forwarding its ref/props to Radix (a real bug),
not that the menu failed to open.
