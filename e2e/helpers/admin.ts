import { expect, type Page, type Locator } from "@playwright/test";

export const OWNER = {
  email: "support+paywalltest2@tidywisecleaning.com",
  password: "TestPaywall2026!",
};

export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(OWNER.email);
  await page.locator("#password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await page.waitForTimeout(1800); // SplashScreen minDuration
}

/**
 * Creates a throwaway booking via the empty-state "Create Booking" button
 * (BookingsPage has no persistent header button — see report). Forces the
 * empty state by searching for a UUID that can't match any real booking,
 * then picks the first EXISTING customer on file (the "New Customer" path
 * is blocked on this org — see report: inserting a new customer 403s on
 * an RLS policy requiring an active subscription, and the Save button
 * silently no-ops with no error shown) + the first available service/
 * date/time. The existing customer's own record is never modified.
 *
 * Returns the created booking's number (captured directly from the
 * Supabase insert response) so callers can find this exact row again
 * regardless of which customer it's attached to.
 */
export async function createTestBooking(page: Page): Promise<{ bookingNumber: string }> {
  await page.goto("/dashboard/bookings");
  const search = page.getByPlaceholder("Search by name, service, or booking #...");
  await search.fill(`no-such-booking-${Date.now()}`);

  const createBtn = page.getByRole("button", { name: "Create Booking", exact: true });
  await expect(createBtn).toBeVisible({ timeout: 10_000 });
  await createBtn.click();

  await expect(page.getByRole("heading", { name: "New Booking", exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // Customer step — Existing Customer tab, pick whichever customer is first
  // on file. Their record is only read, never written to.
  await page.getByRole("tab", { name: "Existing Customer" }).click();
  const customerSearch = page.getByPlaceholder(/search customers/i);
  await customerSearch.click();
  const firstResult = page.locator("li").filter({ hasText: "@" }).first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  await firstResult.click();

  // Service step — pick the first available service.
  const serviceTrigger = page.getByRole("combobox", { name: /select a service/i }).first();
  if (!(await serviceTrigger.isVisible().catch(() => false))) {
    // Fallback: locate by placeholder text if accessible name doesn't match.
    await page.getByText("Select a service", { exact: false }).first().click();
  } else {
    await serviceTrigger.click();
  }
  await page.getByRole("option").first().click();

  // Schedule step — pick date via calendar popover, then a time slot.
  // Note: selecting a day does NOT auto-close the popover (no onSelect-driven
  // close wired up), so it's left covering the time-slot dropdown below it
  // until dismissed explicitly — Escape closes it without changing the pick.
  await page.getByRole("button", { name: "Pick a date", exact: false }).click();
  const dayCells = page.locator('button[name="day"]:not([disabled])');
  await expect(dayCells.first()).toBeVisible({ timeout: 5_000 });
  await dayCells.first().click();
  await page.keyboard.press("Escape");

  await page.getByText("Select time slot", { exact: true }).click();
  await page.getByRole("option").first().click();

  // This QA org has no Stripe account connected, so "Card on File" (the
  // default payment method) can't actually be saved. Use "In-Person
  // Payment" instead, which needs no Stripe connection.
  const inPerson = page.getByRole("button", { name: "In-Person Payment", exact: true });
  if (await inPerson.isVisible().catch(() => false)) {
    await inPerson.click();
  }

  const saveBtn = page.getByRole("button", { name: "Save Booking", exact: true });
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/rest/v1/bookings") && res.request().method() === "POST",
      { timeout: 15_000 },
    ),
    saveBtn.click(),
  ]);
  const body = await response.json().catch(() => null);
  const created = Array.isArray(body) ? body[0] : body;
  const bookingNumber = String(created?.booking_number ?? "");
  expect(bookingNumber, "booking_number should be present in the insert response").not.toBe("");

  // Dialog should close on success.
  await expect(page.getByRole("heading", { name: "New Booking", exact: true })).not.toBeVisible({
    timeout: 15_000,
  });

  return { bookingNumber };
}

/** Locates the row for a booking created by createTestBooking() via search. */
export async function findBookingRow(page: Page, bookingNumber: string) {
  await page.goto("/dashboard/bookings");
  const search = page.getByPlaceholder("Search by name, service, or booking #...");
  await search.fill(bookingNumber);
  const row = page.getByRole("row", { name: new RegExp(`#?${bookingNumber}\\b`) });
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

/** Opens the "..." row-actions dropdown for a given row and returns the menu locator. */
export async function openRowMenu(page: Page, row: Locator) {
  const menuButton = row.getByRole("button").last();
  await menuButton.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible({ timeout: 5_000 });
  return menu;
}
