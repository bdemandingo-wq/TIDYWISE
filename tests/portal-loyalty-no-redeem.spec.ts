import { test, expect } from "./fixtures";

/**
 * Loyalty is tiers-only. Points redemption was removed 2026-07-29 together with
 * the redeem-loyalty-points edge function and the customers.credits write.
 *
 * These tests are regression guards for two distinct defects:
 *
 *  1. The Redeem button itself. It granted store credit into customers.credits,
 *     a column no code path ever read — so points were destroyed for nothing.
 *
 *  2. The remount bug that made it repeatable. LoyaltyCard used to be an inline
 *     `const LoyaltyCard = () => (...)` defined inside the page component body,
 *     so every parent re-render produced a new component identity and React
 *     remounted the subtree — resetting the in-flight guard. Because success
 *     called refreshData(), redeeming CAUSED the re-render that revived the
 *     button. Test 3 fails if anyone reintroduces an inline definition.
 */

test.describe("portal loyalty — tiers only", () => {
  test("loyalty card shows points and tier but offers no redemption", async ({ clientPage }) => {
    await clientPage.goto("/portal/dashboard");

    const card = clientPage.getByTestId("portal-loyalty-card").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/pts/i);

    // No redemption affordance anywhere on the page.
    await expect(clientPage.getByRole("button", { name: /redeem/i })).toHaveCount(0);
    await expect(clientPage.getByText(/credit added to your account/i)).toHaveCount(0);
    await expect(clientPage.getByText(/credit applied/i)).toHaveCount(0);
  });

  test("the redemption endpoint is never called", async ({ clientPage }) => {
    const calls: string[] = [];
    clientPage.on("request", (r) => {
      if (r.url().includes("redeem-loyalty-points")) calls.push(r.url());
    });

    await clientPage.goto("/portal/dashboard");
    await clientPage.waitForLoadState("networkidle");

    expect(calls, "redeem-loyalty-points must be unreachable from the portal").toEqual([]);
  });

  test("loyalty card survives a re-render without remounting", async ({ clientPage }) => {
    await clientPage.goto("/portal/dashboard");

    const card = clientPage.getByTestId("portal-loyalty-card").first();
    await expect(card).toBeVisible();

    // Mark the live DOM node. A remount replaces the node and drops the mark;
    // a re-render of a stable component preserves it.
    await card.evaluate((el) => el.setAttribute("data-remount-probe", "1"));

    // Force parent re-renders the way refreshData() used to: switch tabs and back.
    // These must actually click — a silent failure would make this test vacuous.
    await clientPage.getByRole("tab", { name: "History" }).click();
    await clientPage.waitForTimeout(250);
    await clientPage.getByRole("tab", { name: "Upcoming" }).click();
    await clientPage.waitForTimeout(250);

    const probe = await clientPage
      .getByTestId("portal-loyalty-card")
      .first()
      .getAttribute("data-remount-probe");

    expect(
      probe,
      "loyalty card remounted — is it defined inside the page component again?",
    ).toBe("1");
  });
});
