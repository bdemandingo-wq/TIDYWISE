/**
 * Flow 3: Paywall/pricing page loads, and the plan buttons work.
 *
 * There's a pre-existing e2e/pricing-back-flow.spec.ts, but its main CTA
 * selector (`/Start Pro|Choose Pro/`) is stale — the current button text
 * is "Start 7-day free trial" with an aria-label of the form
 * "Start 7-day free trial of {tier} plan, billed {interval} after trial"
 * (src/pages/PricingPage.tsx:680-694). This spec targets the current copy
 * directly and covers all three tiers, not just Pro.
 */
import { test, expect } from "@playwright/test";

test.describe("Pricing page", () => {
  test("loads with 3 plan tiers and a billing toggle", async ({ page }) => {
    await page.goto("/pricing");

    const list = page.getByRole("list", { name: "Subscription plans" });
    await expect(list).toBeVisible();
    // Scope to the 3 tier cards only — each card also nests its own feature
    // bullet list, which getByRole("listitem") would otherwise pick up too.
    await expect(list.getByRole("listitem", { name: /plan, \$/ })).toHaveCount(3);

    const toggle = page.getByRole("group", { name: "Billing interval" });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("radio", { name: "Monthly", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Yearly billing/i })).toBeVisible();
  });

  for (const tier of ["Basic", "Pro", "Custom"]) {
    test(`${tier} plan CTA exists, is enabled, and starts checkout`, async ({ page }) => {
      await page.goto("/pricing");

      const card = page.getByRole("listitem", { name: new RegExp(`^${tier} plan`, "i") });
      await expect(card).toBeVisible();

      const cta = card.getByRole("button", { name: /Start 7-day free trial/i });
      await expect(cta).toBeVisible();
      await expect(cta).toBeEnabled();

      await cta.click();

      // Anonymous users are routed into signup/checkout; the important
      // assertion is that clicking the button actually does something
      // (navigates away from a static /pricing) rather than silently no-op.
      await expect(page).not.toHaveURL(/\/pricing$/, { timeout: 10_000 });
    });
  }

  test("billing toggle switches between Monthly and Yearly", async ({ page }) => {
    await page.goto("/pricing");

    const monthly = page.getByRole("radio", { name: "Monthly", exact: true });
    const yearly = page.getByRole("radio", { name: /Yearly billing/i });

    await expect(monthly).toHaveAttribute("aria-checked", "true");
    await yearly.click();
    await expect(yearly).toHaveAttribute("aria-checked", "true");
    await expect(monthly).toHaveAttribute("aria-checked", "false");
  });

  test("Claim a lifetime spot button exists and is interactive", async ({ page }) => {
    await page.goto("/pricing");

    const lifetimeBtn = page.getByRole("button", { name: "Claim a lifetime spot", exact: true });
    const waitlistForm = page.getByRole("button", { name: "Join waitlist", exact: true });

    // Sold-out state swaps the CTA for a waitlist form — assert whichever is present is usable.
    // Use race-based waits (not a one-shot isVisible) since the section can
    // still be rendering when this check runs.
    const lifetimeAppeared = await lifetimeBtn
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (lifetimeAppeared) {
      await expect(lifetimeBtn).toBeEnabled();
    } else {
      await expect(waitlistForm).toBeVisible();
    }
  });
});
