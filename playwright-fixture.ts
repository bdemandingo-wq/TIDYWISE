import { test as base, expect, type Page } from "@playwright/test";

/**
 * TidyWise QA owner account — read-only outside of test data this suite
 * creates itself (never modify real bookings/customers with this session).
 */
export const OWNER_CREDENTIALS = {
  email: "support+paywalltest2@tidywisecleaning.com",
  password: "TestPaywall2026!",
};

async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(OWNER_CREDENTIALS.email);
  await page.locator("#password").fill(OWNER_CREDENTIALS.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  // SplashScreen has a minDuration of 1500ms before the real dashboard mounts.
  await page.waitForTimeout(1800);
}

type Fixtures = {
  ownerPage: Page;
};

export const test = base.extend<Fixtures>({
  // A page that's already logged in as the QA owner account, landed on /dashboard.
  ownerPage: async ({ page }, use) => {
    await loginAsOwner(page);
    await use(page);
  },
});

export { expect };
