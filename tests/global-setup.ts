import { test as setup, expect } from "@playwright/test";
import { QA_OWNER, QA_STAFF, QA_CLIENT } from "../test-credentials";

/**
 * Logs in as each of the 3 QA roles once and saves storageState so the
 * rest of the suite doesn't re-login per test. Re-run whenever a session
 * goes stale:
 *   npx playwright test -c playwright.qa.config.ts --project=setup
 *
 * Route/selector facts below are verified against the live app (not
 * guessed) — see e2e/login.spec.ts and playwright-fixture.ts for the
 * owner/client pattern this reuses, and tests/README.md for the staff
 * route source.
 */

// From .env.test via ../test-credentials. All three are required for this
// project to pass, and a missing one throws with instructions rather than
// skipping — a silent skip here is what hid the last credential breakage.
const OWNER = QA_OWNER;
const STAFF = QA_STAFF;
const CLIENT = QA_CLIENT;

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(OWNER.email);
  await page.locator("#password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await page.waitForTimeout(1800); // SplashScreen minDuration before dashboard actually mounts
  await expect(page).toHaveURL(/\/dashboard/);
  // Belt-and-suspenders alongside the splash-screen wait above — see the
  // staff step below for why a URL/fixed-delay check alone isn't trusted
  // here for the actual localStorage write.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
  await page.context().storageState({ path: "tests/.auth/owner.json" });
});

setup("authenticate as staff", async ({ page }) => {
  await page.goto("/staff/login");
  await page.locator("#email").fill(STAFF.email);
  await page.locator("#password").fill(STAFF.password);
  await page.getByRole("button", { name: "Sign In to Portal", exact: true }).click();
  await page.waitForURL("**/staff**", { timeout: 20_000 });
  await expect(page).toHaveURL(/\/staff/);
  // BUG FOUND 2026-07-14: capturing storageState immediately after the URL
  // matches raced ahead of supabase-js actually persisting the session to
  // localStorage, producing a staff.json with NO sb-*-auth-token key at
  // all (confirmed by inspecting the captured file directly) — every test
  // using staffPage then started with no session. Poll for the real
  // Supabase auth key to actually exist before saving, instead of trusting
  // a fixed delay or the URL alone.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
  await page.context().storageState({ path: "tests/.auth/staff.json" });
});

setup("authenticate as client", async ({ page }) => {
  await page.goto("/portal/login");
  await page.locator("#email").fill(CLIENT.email);
  await page.locator("#password").fill(CLIENT.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByText("Welcome back!")).toBeVisible({ timeout: 10_000 });
  await page.waitForURL("**/portal/dashboard**", { timeout: 20_000 });
  // Client portal auth is a custom localStorage session (key
  // client_portal_session), not Supabase cookies — storageState captures
  // localStorage per-origin, so this still round-trips correctly. Poll for
  // the key directly rather than trusting the URL alone (see the staff
  // step above for why that trust was misplaced there).
  await page.waitForFunction(() => localStorage.getItem("client_portal_session") !== null, { timeout: 10_000 });
  await page.context().storageState({ path: "tests/.auth/client.json" });
});
