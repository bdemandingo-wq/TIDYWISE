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

  test("Stripe cancel_url and success_url point at the in-app /pricing and /checkout/success routes, and cancel preserves plan + interval", () => {
    // Static guard: every Stripe-side exit (cancel button, browser back
    // from the Checkout form, declined-payment "back to merchant" link)
    // routes to whatever cancel_url we hand Stripe. Lock that to
    // /pricing AND require the plan + interval params, so the tier
    // highlight is restorable from URL alone after any Stripe exit.
    const sub = readFileSync(
      join(process.cwd(), "supabase/functions/create-subscription/index.ts"),
      "utf8",
    );
    expect(sub).toMatch(/cancel_url:\s*`\$\{origin\}\/pricing\?plan=/);
    expect(sub).toMatch(/cancel_url:[^`]*interval=\$\{encodeURIComponent/);
    expect(sub).toMatch(/success_url:\s*`\$\{origin\}\/checkout\/success/);

    const lifetime = readFileSync(
      join(process.cwd(), "supabase/functions/buy-lifetime/index.ts"),
      "utf8",
    );
    expect(lifetime).toMatch(/cancel_url:\s*`\$\{origin\}\/pricing/);
    expect(lifetime).toMatch(/success_url:\s*`\$\{origin\}\/checkout\/success/);
  });

  test("URL params restore the tier highlight after a full refresh during checkout (Stripe embedded cancel path)", async ({ page }) => {
    // Simulates the embedded-checkout cancel_url landing: Stripe sends
    // the user back to /pricing?plan=pro&interval=yearly&canceled=1.
    // Even with NO sessionStorage (cleared by browser refresh, hard
    // reload, or a different tab), the URL params alone must restore
    // the yearly toggle and the Pro tier highlight.
    await page.goto("/pricing");
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/pricing?plan=pro&interval=yearly&canceled=1");

    const yearlyBtn = page.getByRole("radio", { name: /Yearly/i });
    await expect(yearlyBtn).toHaveAttribute("aria-checked", "true");

    const proCard = page
      .locator("text=Pro")
      .first()
      .locator(
        'xpath=ancestor::*[contains(@class, "p-7") and contains(@class, "flex-col")][1]',
      );
    await expect(proCard).toHaveClass(/ring-2/);
    await expect(proCard).toHaveAttribute("aria-current", "true");
  });

  test("Card-decline retry: Stripe cancel_url restores plan highlight so the user can re-attempt without re-picking", async ({ page }) => {
    // After a card decline, Stripe's "Back to merchant" link uses
    // cancel_url. Our cancel_url includes plan + interval, so the
    // returning user lands with the same tier preselected and can hit
    // the same "Choose Pro" button immediately.
    await page.goto("/pricing?plan=pro&interval=yearly&canceled=1");

    const proCard = page
      .locator("text=Pro")
      .first()
      .locator(
        'xpath=ancestor::*[contains(@class, "p-7") and contains(@class, "flex-col")][1]',
      );
    await expect(proCard).toHaveClass(/ring-2/);

    // The retry button is still the same, labeled with an SR-friendly
    // aria-label describing plan + billing interval.
    const retry = proCard
      .getByRole("button", { name: /Pro plan, billed yearly/i })
      .first();
    await expect(retry).toBeVisible();
  });

  test("/pricing tier cards expose accessible names and the billing toggle uses radio semantics", async ({ page }) => {
    await page.goto("/pricing");

    // Billing interval toggle is a radio group.
    const group = page.getByRole("group", { name: /Billing interval/i });
    await expect(group).toBeVisible();
    await expect(page.getByRole("radio", { name: /Monthly/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Each tier renders as a listitem with a descriptive aria-label.
    const planList = page.getByRole("list", { name: /Subscription plans/i });
    await expect(planList).toBeVisible();
    const items = planList.getByRole("listitem");
    await expect(items).toHaveCount(3);
  });

  test("/checkout/success renders an aria-live success message, a clear Back to plans link, and clears storage", async ({ page }) => {
    // Pre-seed a stale persisted plan from a previous visit.
    await page.goto("/pricing");
    await page.evaluate(() => {
      sessionStorage.setItem(
        "tw_pending_plan",
        JSON.stringify({ plan: "pro", interval: "yearly" }),
      );
    });

    await page.goto("/checkout/success?plan=pro&interval=yearly");

    // Screen-reader-friendly status region announces the success.
    const status = page.getByRole("status");
    await expect(status).toBeVisible();
    await expect(status).toContainText(/You're in/);
    // Yearly receipt copy explicitly mentions the next billing date.
    await expect(status).toContainText(/next billing date/i);

    await expect(page.getByRole("heading", { name: /You're in/ })).toBeVisible();

    const backLink = page.getByRole("link", { name: /Back to pricing plans|Back to plans/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/pricing");

    // Storage cleared on success.
    const after = await page.evaluate(() =>
      sessionStorage.getItem("tw_pending_plan"),
    );
    expect(after).toBeNull();
  });
});

