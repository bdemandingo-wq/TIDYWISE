/**
 * End-to-end coverage for the /pricing → /signup → back-button flow.
 *
 * We can't drive Stripe Checkout from Playwright (it's hosted off-domain
 * and requires real card data), so these tests cover every leg of the
 * round-trip that lives inside our app:
 *
 *   1. /pricing  → click "Start Pro" with yearly toggled
 *   2. /signup?plan=pro&interval=yearly renders the plan banner +
 *      "Back to plans" link
 *   3. Browser back → /pricing with yearly still selected AND the Pro
 *      tier visually highlighted (ring on the Card)
 *
 * The Stripe legs (cancel_url, the back arrow on the Checkout page, and
 * the "form back" Stripe shows after a card failure) all redirect to the
 * `cancel_url` set in the edge function — which we verify by inspecting
 * the source string. That's the best we can do without a live Stripe
 * session.
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test.describe("Pricing back-button flow (yearly)", () => {
  test("yearly Pro → signup → back returns to /pricing with Pro highlighted and yearly selected", async ({ page }) => {
    await page.goto("/pricing");

    // Toggle to yearly billing.
    await page.getByRole("button", { name: "Yearly", exact: false }).click();

    // Sanity: the Pro card now shows the yearly sub-line ("billed $970/yr").
    const proCard = page
      .locator("text=Pro")
      .first()
      .locator(
        'xpath=ancestor::*[contains(@class, "p-7") and contains(@class, "flex-col")][1]',
      );
    await expect(proCard).toContainText("billed $970/yr");

    // Start checkout for Pro.
    await proCard.getByRole("button", { name: /Start Pro|Choose Pro/ }).click();

    // Anonymous → signup with plan + interval in the URL.
    await page.waitForURL(/\/signup\?plan=pro&interval=yearly/);

    // Banner shows the chosen plan + the new "Back to plans" link is visible.
    await expect(page.getByText("Signing up to start", { exact: false })).toBeVisible();
    const backLink = page.getByRole("link", { name: /Back to plans/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/pricing");

    // sessionStorage must contain the persisted choice so /pricing can
    // restore it on the next mount.
    const persisted = await page.evaluate(() =>
      sessionStorage.getItem("tw_pending_plan"),
    );
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted as string)).toEqual({
      plan: "pro",
      interval: "yearly",
    });

    // Hit the browser back button — this is the exact flow users
    // complained about ("takes me back to sign up again" loop).
    await page.goBack();
    await page.waitForURL(/\/pricing/);

    // Yearly toggle should still be active (restored from sessionStorage).
    const yearlyBtn = page.getByRole("button", { name: "Yearly", exact: false });
    // The active variant uses bg-background; the inactive one uses muted text.
    await expect(yearlyBtn).toHaveClass(/bg-background/);

    // Pro card should be visually highlighted with the primary ring.
    const restoredProCard = page
      .locator("text=Pro")
      .first()
      .locator(
        'xpath=ancestor::*[contains(@class, "p-7") and contains(@class, "flex-col")][1]',
      );
    await expect(restoredProCard).toHaveClass(/ring-2/);

    // After restore the persisted entry is cleared so a future fresh
    // visit doesn't re-highlight stale state.
    const afterRestore = await page.evaluate(() =>
      sessionStorage.getItem("tw_pending_plan"),
    );
    expect(afterRestore).toBeNull();
  });

  test("leaving /pricing for a non-flow route clears the persisted plan", async ({ page }) => {
    await page.goto("/pricing");
    // Seed a plan as if the user had clicked checkout earlier.
    await page.evaluate(() => {
      sessionStorage.setItem(
        "tw_pending_plan",
        JSON.stringify({ plan: "basic", interval: "monthly" }),
      );
    });

    // Navigate away to the home page — that's "manually leaving the
    // pricing flow", so PricingPage's unmount cleanup should fire.
    await page.goto("/");

    const after = await page.evaluate(() =>
      sessionStorage.getItem("tw_pending_plan"),
    );
    expect(after).toBeNull();
  });

  test("Stripe cancel_url and success_url point at the in-app /pricing and /checkout/success routes", () => {
    // Static guard: every Stripe-side exit (cancel button, browser back
    // from the Checkout form, declined payment "back to merchant" link)
    // routes to whatever cancel_url we hand Stripe. Lock that to /pricing.
    const sub = readFileSync(
      join(process.cwd(), "supabase/functions/create-subscription/index.ts"),
      "utf8",
    );
    expect(sub).toMatch(/cancel_url:\s*`\$\{origin\}\/pricing`/);
    expect(sub).toMatch(/success_url:\s*`\$\{origin\}\/checkout\/success/);

    const lifetime = readFileSync(
      join(process.cwd(), "supabase/functions/buy-lifetime/index.ts"),
      "utf8",
    );
    expect(lifetime).toMatch(/cancel_url:\s*`\$\{origin\}\/pricing/);
    expect(lifetime).toMatch(/success_url:\s*`\$\{origin\}\/checkout\/success/);
  });

  test("/checkout/success renders with a clear Back to plans link and clears storage", async ({ page }) => {
    // Pre-seed a stale persisted plan from a previous visit.
    await page.goto("/pricing");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "tw_pending_plan",
        JSON.stringify({ plan: "pro", interval: "yearly" }),
      );
    });

    await page.goto("/checkout/success?plan=pro&interval=yearly");

    await expect(page.getByRole("heading", { name: /You're in/ })).toBeVisible();

    const backLink = page.getByRole("link", { name: /Back to plans/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/pricing");

    // Storage cleared on success.
    const after = await page.evaluate(() =>
      sessionStorage.getItem("tw_pending_plan"),
    );
    expect(after).toBeNull();
  });
});
