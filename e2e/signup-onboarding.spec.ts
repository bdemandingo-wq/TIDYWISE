/**
 * Flow 2: Signup + the 6-step onboarding (src/pages/OnboardingPage.tsx).
 *
 * This test creates one real account + organization (Supabase Auth has no
 * "dry run" mode). It's tagged QA-TEST-DELETE and uses a bdemandingo+
 * alias (per this project's email-safety rule — never send real
 * signup/notification emails outside that alias or the support+
 * paywalltest2 address). This account is NOT cleaned up automatically —
 * the test session running this suite has no database write/service-role
 * access. See the final report for the exact identifiers to delete.
 *
 * Onboarding is a single component with 6 in-page steps (no separate step
 * files, no URL change between steps, no server-side persistence of
 * progress until the final "Create Business" submit) — so this all has
 * to run as one continuous session/test rather than separate tests with
 * fresh logins, or the step state resets to Step 1 each time.
 */
import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();
const TEST_EMAIL = `bdemandingo+e2eonboarding${RUN_ID}@gmail.com`;
const TEST_PASSWORD = "QaTestDelete2026!";
const BUSINESS_NAME = `QA-TEST-DELETE E2E Onboarding ${RUN_ID}`;

// SKIPPED BY DEFAULT — 2026-07-29.
//
// This spec creates a real auth user AND a real organization in production on
// every run, and cleans up neither (see the note above: no service-role access
// from the test session). Those have been accumulating: search for
// `bdemandingo+e2eonboarding%@gmail.com` in auth.users and
// `QA-TEST-DELETE E2E Onboarding %` in organizations.
//
// Cleaning them up without skipping this just resets the counter, so the default
// is now off. Run it deliberately when you actually want to exercise signup, and
// delete the account and org it reports afterwards:
//
//   npx playwright test e2e/signup-onboarding.spec.ts --grep-invert "@nope"
//
// (any invocation that overrides the skip works; the point is that a routine
// full-suite run no longer creates production data)
//
// Removing this skip is only appropriate once the spec tears down what it
// creates — which needs service-role access it does not currently have.
test.skip("signup → full 6-step onboarding → Create Business → paywall", async ({ page }) => {
  console.log(`[QA-TEST-DELETE] account created by this run: ${TEST_EMAIL} / business: ${BUSINESS_NAME}`);

  await test.step("signup form creates an account and redirects toward onboarding", async () => {
    await page.goto("/signup");

    await expect(page.locator("#fullName")).toBeVisible();
    await page.locator("#fullName").fill("QA TEST-DELETE E2E");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.locator("#confirmPassword").fill(TEST_PASSWORD);
    await page.locator("#tos").check();

    const submit = page.getByRole("button", { name: /Create Account/i });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Splash screen (~1500ms) then redirect: new users with no org land on /onboarding.
    await page.waitForURL("**/onboarding**", { timeout: 25_000 });
    await expect(page).toHaveURL(/\/onboarding/);
  });

  await test.step("step 1: business name → Continue", async () => {
    const businessName = page.locator("#businessName");
    await expect(businessName).toBeVisible();
    await businessName.fill(BUSINESS_NAME);

    const continueBtn = page.getByRole("button", { name: "Continue", exact: true });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    await expect(page.getByText("Where's your business today?", { exact: false })).toBeVisible({
      timeout: 5_000,
    });
  });

  await test.step("steps 2-5: auto-advancing qualifying questions", async () => {
    // Step 2
    await page.getByRole("button", { name: "Just me", exact: false }).click();

    // Step 3
    await expect(
      page.getByText("How do bookings come in right now?", { exact: false }),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Calls & texts I track myself/i }).click();

    // Step 4
    await expect(page.getByText("What's eating most of your week?", { exact: false })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole("button", { name: /Scheduling & dispatching chaos/i }).click();

    // Step 5
    await expect(
      page.getByText("Where do you want to be in 12 months?", { exact: false }),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /First consistent/i }).click();

    // Step 6 reached
    await expect(page.getByRole("button", { name: "Create Business", exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });

  await test.step("step 6: service selection → Create Business completes onboarding", async () => {
    const createBtn = page.getByRole("button", { name: "Create Business", exact: true });
    await expect(createBtn).toBeVisible();

    // Ensure at least one service is selected (button is disabled otherwise).
    if (await createBtn.isDisabled()) {
      const selectAll = page.getByRole("button", { name: "Select All", exact: true });
      if (await selectAll.isVisible().catch(() => false)) {
        await selectAll.click();
      }
    }
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // "Building {business}'s dashboard" overlay plays for ~4.2s, then redirects
    // to /choose-plan (the paywall) on web.
    await page.waitForURL("**/choose-plan**", { timeout: 15_000 });
    await expect(page).toHaveURL(/\/choose-plan/);
  });
});
