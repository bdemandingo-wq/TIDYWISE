import { defineConfig, devices } from "@playwright/test";

/**
 * QA regression suite — built from TidyWise-QA-Checklist.xlsx.
 *
 * Separate from playwright.config.ts (which targets the local dev server
 * for the existing e2e/ critical-flow suite). This one targets the LIVE
 * production site and is read-only by default: any test that creates data
 * names it "QA-TEST-DELETE" and cleans up in afterEach.
 *
 * Run: npx playwright test -c playwright.qa.config.ts
 * First run (or to refresh stale sessions): npx playwright test -c playwright.qa.config.ts --project=setup
 */
const BASE_URL = process.env.QA_BASE_URL || "https://www.jointidywise.com";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa-report", open: "never" }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      // Pure logic tests (*.unit.spec.ts): no browser, no login, no network,
      // no live site. Deliberately declares NO dependencies so it does not
      // inherit the setup -> logout-check chain that every "chromium" test
      // waits on — those perform real production logins and take ~a minute.
      // Run alone with: npx playwright test -c playwright.qa.config.ts --project=unit
      name: "unit",
      testMatch: /.*\.unit\.spec\.ts/,
    },
    {
      // broadcast-audience.contract.spec.ts talks to Supabase directly via
      // supabase-js (its own sign-ins, its own RPC/edge-function calls) and
      // never touches the app UI, so it needs no storageState and no
      // dependency on "setup"/"logout-check". Without this project it falls
      // through to "chromium" by filename (it isn't *.unit.spec.ts), which
      // DOES depend on that chain — pulling in ~a minute of real production
      // logins it doesn't need and, worse, silently not running at all in
      // `npm run test:qa` whenever setup's three QA-role credentials are
      // absent, even though this spec's own two credentials are present.
      //
      // Not folded into "unit" above: "unit" is for pure, network-free
      // logic (no browser, no live site — see its comment), and this spec
      // makes real network calls to a live Supabase project. Not widened to
      // match every *.contract.spec.ts file: the sibling contract specs
      // (facebook-lead-backfill, facebook-lead-webhook, speed-to-lead) are
      // unaffected by this fix and stay on "chromium" via their documented
      // --no-deps invocation; only this one file's project assignment
      // changes here.
      name: "broadcast-audience-contract",
      testMatch: /broadcast-audience\.contract\.spec\.ts$/,
    },
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
    },
    {
      // Exercises the real Logout button (1.4). CONFIRMED 2026-07-14: the
      // app's signOut() uses Supabase's default scope:'global', which
      // revokes ALL sessions for that account everywhere — not just the
      // session that logged out. That's unavoidable from this test's side,
      // so it must run, then re-save a fresh tests/.auth/owner.json,
      // BEFORE any other owner-authenticated test lazily creates the
      // worker-scoped ownerContext (see fixtures.ts) — otherwise that
      // context loads the file while it's still poisoned from the
      // previous run. A file-naming/alphabetical-order assumption isn't
      // robust enough for this (accessibility.spec.ts's 9.3 test also
      // uses ownerPage and would sort first) — an explicit project
      // dependency, same pattern as "setup" below, is what actually
      // guarantees the ordering.
      name: "logout-check",
      testMatch: /logout-check\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup", "logout-check"],
      testIgnore: /global-setup\.ts|logout-check\.spec\.ts|.*\.unit\.spec\.ts|broadcast-audience\.contract\.spec\.ts/,
    },
  ],
});
