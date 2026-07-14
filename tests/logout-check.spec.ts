import { test, expect } from "@playwright/test";

/**
 * 1.4 — Logout ends session; back button doesn't restore it.
 *
 * Lives in its own file/project (see playwright.qa.config.ts: the
 * "logout-check" project runs after "setup" and before "chromium", which
 * depends on both) rather than inside auth-session.spec.ts. This is
 * DELIBERATE, not stylistic:
 *
 * ROOT CAUSE CONFIRMED 2026-07-14 (decisive, reproducible, verified with a
 * standalone script outside the test runner entirely — not a Playwright
 * artifact): src/hooks/useAuthNoSession.tsx calls
 * `supabase.auth.signOut()` with no scope argument, which is Supabase
 * SDK's own default of scope:'global'. Per Supabase's docs, 'global'
 * terminates ALL sessions for that user account, everywhere — not just
 * the session that called signOut(). Proven directly: a totally
 * independent, freshly-logged-in owner session clicking the real Logout
 * button was enough to kill a completely unrelated owner session that had
 * been open the whole time and was never touched — confirmed via a direct
 * Supabase REST check immediately after (403 session_not_found). This is
 * genuine, confirmed PRODUCT BEHAVIOR — clicking Logout in one tab/device
 * signs the owner out of every other open tab, browser, and the mobile
 * app too. Worth confirming with product whether that's the intended UX
 * (some apps want this for security; others would consider it a bug)
 * rather than an accidental default.
 *
 * Practical consequence for this suite: no amount of context/session
 * isolation on THIS test's own login can stop it from killing the shared
 * tests/.auth/owner.json session every other owner-authenticated test
 * depends on — global scope kills it regardless of which session
 * initiated the call. So this test re-establishes a fresh owner session
 * and re-saves storageState at the end, and the project-dependency
 * ordering above guarantees that happens BEFORE any other test lazily
 * creates the worker-scoped ownerContext (fixtures.ts) and loads the
 * file. A same-file/alphabetical-order assumption isn't robust enough for
 * this — accessibility.spec.ts's 9.3 test also uses ownerPage and would
 * otherwise sort first.
 */

const OWNER = {
  email: "support+paywalltest2@tidywisecleaning.com",
  password: "TestPaywall2026!",
};

test("1.4 — owner: sidebar Logout redirects to /login and back-nav does not restore the dashboard", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(OWNER.email);
  await page.locator("#password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await page.waitForTimeout(1800); // SplashScreen minDuration
  await expect(page).toHaveURL(/\/dashboard/);

  // Business-switcher button at the bottom of the sidebar opens the profile
  // dropdown containing the "Logout" item (AdminSidebar.tsx).
  const switcher = page.locator("button", { hasText: /Owner|Team Member/ }).last();
  await switcher.click();
  await page.getByRole("button", { name: "Logout", exact: true }).click();

  // signOut() does a hard window.location redirect to /login — wait for
  // the URL to settle rather than a single navigation event.
  await page.waitForURL("**/login**", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/login/);

  const hasSupabaseSession = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith("sb-") || k.includes("supabase")),
  );
  expect(hasSupabaseSession, "logout must clear the Supabase session from localStorage").toBe(false);

  // Back button: protected routes re-check auth on mount (AdminRoute), so
  // even if bfcache serves a stale DOM, the guard should bounce to /login.
  await page.goBack();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

  // Re-establish a fresh session and overwrite tests/.auth/owner.json —
  // this test's global-scope logout just killed EVERY owner session,
  // including the one every other owner-authenticated test in this run
  // depends on. See file header for why this must run before any other
  // test touches the shared ownerContext.
  await page.goto("/login");
  await page.locator("#email").fill(OWNER.email);
  await page.locator("#password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await page.waitForTimeout(1800);
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
  await context.storageState({ path: "tests/.auth/owner.json" });

  await context.close();
});
