import { test, expect } from "./fixtures";
import { QA_OWNER } from "../test-credentials";

const OWNER = QA_OWNER; // from .env.test via ../test-credentials

test.describe("1.2 — Login with correct credentials succeeds", () => {
  test("owner logs in and lands on /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(OWNER.email);
    await page.locator("#password").fill(OWNER.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/dashboard**", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("1.3 — Login with wrong password is rejected with clear error", () => {
  test("wrong password shows an error and creates no session", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(OWNER.email);
    await page.locator("#password").fill("definitely-the-wrong-password-123");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page.getByText(/Invalid email or password|Could not sign you in/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);

    // No session token was persisted anywhere in the browser.
    const hasSupabaseSession = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("sb-") || k.includes("supabase")),
    );
    expect(hasSupabaseSession, "a wrong-password attempt must not leave a session token in localStorage").toBe(false);
  });
});

// 1.4 (Logout) lives in tests/logout-check.spec.ts, run via its own
// "logout-check" Playwright project — see that file's header for why:
// the app's real logout is global-scope (kills every session for the
// account, confirmed live), so it has to run in a guaranteed position
// before any test here lazily creates the shared ownerContext.

test.describe("1.7 — Session persists on refresh, expires after timeout", () => {
  test("owner: a hard refresh on /dashboard keeps the session (does not bounce to /login)", async ({
    ownerPage: page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    await page.waitForLoadState("networkidle");
    // AdminRoute redirects to /login only when there's no user; staying on
    // /dashboard after a refresh proves the Supabase session (localStorage,
    // persistSession: true) survived the reload.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("an invalid/expired access token bounces protected routes to /login", async ({ page }) => {
    // Simulate expiry: seed a syntactically-plausible but invalid Supabase
    // session before the app's auth guard runs, then hit a protected route.
    await page.addInitScript(() => {
      const fakeKey = "sb-slwfkaqczvwvvvavkgpr-auth-token";
      localStorage.setItem(
        fakeKey,
        JSON.stringify({
          access_token: "expired.invalid.token",
          refresh_token: "expired-refresh-token",
          expires_at: Math.floor(Date.now() / 1000) - 3600, // 1h in the past
          token_type: "bearer",
          user: { id: "00000000-0000-0000-0000-000000000000" },
        }),
      );
    });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
