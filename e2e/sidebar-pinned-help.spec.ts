// Help must be pinned above the sidebar's scroll area, on desktop and mobile,
// and must not be hideable.
//
// Runs against the LOCAL dev server — playwright.config.ts starts `npm run dev`
// on :8080 itself, so nothing needs to be running first and nothing needs to be
// deployed:
//
//   npx playwright test e2e/sidebar-pinned-help.spec.ts
//
// That matters here: src/** reaches production through a Lovable publish, and
// with credits out this is the only way to verify the change at all.
//
// The premise this file encodes, having been checked rather than assumed:
// Dashboard is NOT pinned today. AdminSidebar.tsx:474 puts the whole nav list
// inside one `flex-1 overflow-y-auto` container and Dashboard is merely its
// first element. So "pinned" here means structurally outside that container —
// which is what the scroll test below actually measures.
import { test, expect, type Page } from "@playwright/test";
import { loginAsOwner } from "./helpers/admin";

const HELP_HREF = "/dashboard/help";

/** The scrollable nav region — everything pinned must live OUTSIDE this. */
const scrollArea = (page: Page) => page.locator("nav.overflow-y-auto").first();
const helpLink = (page: Page) => page.locator(`a[href="${HELP_HREF}"]`);

test.describe("Help is pinned above the sidebar scroll area", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOwner(page);
  });

  test("exactly one Help link exists, and it is NOT inside the scroll container", async ({
    page,
  }) => {
    await expect(helpLink(page)).toHaveCount(1);
    // The structural assertion. Before this change Help was the last item
    // INSIDE nav.overflow-y-auto (AdminSidebar.tsx:118), so this count was 1.
    await expect(
      scrollArea(page).locator(`a[href="${HELP_HREF}"]`),
      "Help is still inside the scrollable nav, so it can be scrolled away",
    ).toHaveCount(0);
  });

  test("Help renders ABOVE the scroll container, not below it", async ({ page }) => {
    // "Pinned to the top" specifically, rather than merely pinned. A fixed
    // footer would satisfy every other test in this file but not this one.
    const helpBox = await helpLink(page).boundingBox();
    const navBox = await scrollArea(page).boundingBox();
    expect(helpBox, "Help link has no bounding box").not.toBeNull();
    expect(navBox, "scroll container has no bounding box").not.toBeNull();
    expect(helpBox!.y).toBeLessThan(navBox!.y);
  });

  test("Help survives scrolling the nav to its end", async ({ page }) => {
    const nav = scrollArea(page);

    // CONTROL, and it is load-bearing. On a viewport tall enough to show every
    // nav item there is nothing to scroll, and "Help is still visible" would
    // pass while proving nothing. So shrink the viewport until the nav really
    // overflows, and assert a normal in-list item DOES leave the viewport in
    // the same scroll. If that item stays put, the scroll was a no-op and this
    // test fails rather than falsely passing.
    await page.setViewportSize({ width: 1280, height: 500 });

    const overflows = await nav.evaluate((el) => el.scrollHeight > el.clientHeight + 20);
    expect(overflows, "nav does not overflow, so this test cannot prove anything").toBe(true);

    const firstListItem = nav.locator("a[href^='/dashboard']").first();
    await expect(firstListItem).toBeInViewport();

    await nav.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(300);

    // The control: a normal item scrolled out of view.
    await expect(
      firstListItem,
      "the scroll did not move anything — the Help assertion below would be vacuous",
    ).not.toBeInViewport();

    // The actual requirement.
    await expect(helpLink(page), "Help scrolled away with the list").toBeInViewport();
  });

  test("Help is not draggable — it is outside the sort context", async ({ page }) => {
    // Items in defaultNavigation render via SortableNavItem and carry dnd-kit
    // attributes. A pinned item renders via StaticNavItem and must not.
    const help = helpLink(page);
    await expect(help).not.toHaveAttribute("aria-roledescription", /sortable/i);
    await expect(help).not.toHaveAttribute("aria-describedby", /DndDescribedBy/i);
  });

  test("clicking pinned Help still navigates and marks itself active", async ({ page }) => {
    await helpLink(page).click();
    await page.waitForURL(`**${HELP_HREF}**`);
    // Pulling the item out of the list must not cost it its active styling —
    // the active class comes from the same `sidebar-link ... active` pattern.
    await expect(helpLink(page)).toHaveClass(/active/);
  });
});

test.describe("Help is pinned on mobile too", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the mobile sheet pins Help outside its scroll area", async ({ page }) => {
    await loginAsOwner(page);

    // Mobile renders the same SidebarContent inside a Sheet, so one insertion
    // should cover both. This test is what proves that rather than assuming it.
    await page.getByRole("button", { name: /open navigation menu/i }).click();
    await expect(helpLink(page)).toBeVisible();
    await expect(
      scrollArea(page).locator(`a[href="${HELP_HREF}"]`),
      "Help is inside the mobile scroll area",
    ).toHaveCount(0);
  });
});

test.describe("Help cannot be hidden", () => {
  test("the Settings toggle for Help is disabled, like Dashboard's", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/dashboard/settings");

    // Settings labels it "Help Videos" while the sidebar says "Help" — same
    // href, two labels. That mismatch is a known drift finding, deliberately
    // not fixed here, so this test matches on either rather than pinning the
    // wrong one: docs/superpowers/plans/2026-08-12-sidebar-nav-list-drift.md
    const row = page
      .locator("li, div")
      .filter({ hasText: /^Help( Videos)?$/ })
      .first();
    const toggle = row.getByRole("switch").first();

    if ((await toggle.count()) === 0) {
      test.skip(true, "sidebar visibility settings not reachable from this route");
    }
    await expect(toggle, "Help can still be hidden — required flag missing").toBeDisabled();
  });
});
