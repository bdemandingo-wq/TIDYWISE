/**
 * Flow 1: Login.
 *
 * Covers the owner/admin login form (/login) with both an invalid and a
 * valid attempt, plus the separate client-portal login form (/portal/login)
 * using the client test account. These are two different forms/components
 * in the app (LoginPage vs PortalLoginPage) — the client test account is
 * scoped to the client portal, so it's exercised there rather than forced
 * through the owner form.
 */
import { test, expect } from "@playwright/test";

const OWNER = {
  email: "support+paywalltest2@tidywisecleaning.com",
  password: "TestPaywall2026!",
};

const CLIENT = {
  email: "bdemandingo+client@gmail.com",
  password: "tidywise123",
};

test.describe("Login — owner/admin (/login)", () => {
  test("email and password inputs, submit button exist and are enabled", async ({ page }) => {
    await page.goto("/login");
    const email = page.locator("#email");
    const password = page.locator("#password");
    const submit = page.getByRole("button", { name: "Sign In", exact: true });

    await expect(email).toBeVisible();
    await expect(email).toBeEnabled();
    await expect(password).toBeVisible();
    await expect(password).toBeEnabled();
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
  });

  test("invalid credentials show an error and keep the user on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("nonexistent-user-e2e@example.com");
    await page.locator("#password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(page.getByText(/Invalid email or password|Could not sign you in/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("valid owner credentials log in and land on /dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(OWNER.email);
    await page.locator("#password").fill(OWNER.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();

    await page.waitForURL("**/dashboard**", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("Login — client portal (/portal/login)", () => {
  test("valid client credentials log in and land on /portal/dashboard", async ({ page }) => {
    await page.goto("/portal/login");
    const email = page.locator("#email");
    const password = page.locator("#password");
    const submit = page.getByRole("button", { name: "Sign In", exact: true });

    await expect(email).toBeVisible();
    await expect(submit).toBeEnabled();

    await email.fill(CLIENT.email);
    await password.fill(CLIENT.password);
    await submit.click();

    await expect(page.getByText("Welcome back!")).toBeVisible({ timeout: 10_000 });
    await page.waitForURL("**/portal/dashboard**", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/portal\/dashboard/);
  });
});
