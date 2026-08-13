/**
 * Flow 4: Admin — create a booking, open it, reschedule it, cancel it.
 *
 * BLOCKED — skipped for now (see final QA report for full details):
 * the QA owner account's org (QA_OWNER_EMAIL in .env.test)
 * has zero existing customers, and creating a new customer via the
 * booking form's "New Customer" tab is blocked by an RLS policy that
 * requires an active subscription ("Requires active subscription to
 * insert customers"). There is currently no way to create a booking via
 * the admin UI on this org at all — neither an existing customer to pick
 * nor a way to add a new one. Remove `.skip` once this org has an active
 * subscription (or point the suite at a different, properly-seeded org).
 *
 * Also worth fixing separately: the "Save Booking" button gives no
 * feedback when this RLS check fails — it just silently stays on the
 * form with no error toast, which looks like a dead/broken button.
 *
 * Per explicit instruction: never operate on real booking data. This
 * suite creates its own throwaway booking via the "Create Booking"
 * empty-state button (see e2e/helpers/admin.ts — the page has no
 * persistent header "New Booking" button, which is itself a finding,
 * noted in the report), attached to an existing (unmodified) customer,
 * and only ever acts on that one booking.
 *
 * There's also no dedicated "Reschedule" button in this app — rescheduling
 * is done via the row's "Edit" action, which reopens the same booking form
 * with the Schedule step editable. That's exercised here as "reschedule".
 */
import { test, expect } from "@playwright/test";
import { loginAsOwner, createTestBooking, findBookingRow, openRowMenu } from "./helpers/admin";

test.describe.skip("Admin bookings: create → open → reschedule → cancel", () => {
  let bookingNumber: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsOwner(page);
    const result = await createTestBooking(page);
    bookingNumber = result.bookingNumber;
    await page.close();
  });

  test("booking was created and appears in the list", async ({ page }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    await expect(row).toBeVisible();
  });

  test("open booking: row menu → View Details shows the booking dialog", async ({ page }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    const menu = await openRowMenu(page, row);

    const viewDetails = menu.getByText("View Details", { exact: true });
    await expect(viewDetails).toBeVisible();
    await expect(viewDetails).toBeEnabled();
    await viewDetails.click();

    await expect(page.getByText(/^Booking #\d+/)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });

  test("reschedule: row menu → Edit → change date/time → Update Booking", async ({ page }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    const menu = await openRowMenu(page, row);

    const editItem = menu.getByText("Edit", { exact: true });
    await expect(editItem).toBeVisible();
    await expect(editItem).toBeEnabled();
    await editItem.click();

    await expect(page.getByRole("heading", { name: "Edit Booking", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Reopen the date picker and pick a different day than whatever is set.
    await page.getByRole("button", { name: /Pick a date|[A-Z][a-z]+day,/ }).first().click();
    const dayCells = page.locator('button[name="day"]:not([disabled])');
    await expect(dayCells.first()).toBeVisible({ timeout: 5_000 });
    await dayCells.last().click();
    await page.keyboard.press("Escape"); // popover doesn't auto-close on select

    const updateBtn = page.getByRole("button", { name: "Update Booking", exact: true });
    await expect(updateBtn).toBeVisible();
    await expect(updateBtn).toBeEnabled();
    await updateBtn.click();

    await expect(page.getByRole("heading", { name: "Edit Booking", exact: true })).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test("cancel: row menu → Mark Cancelled → confirm", async ({ page }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    const menu = await openRowMenu(page, row);

    const cancelItem = menu.getByText("Mark Cancelled", { exact: true });
    await expect(cancelItem).toBeVisible();
    await expect(cancelItem).toBeEnabled();
    await cancelItem.click();

    await expect(page.getByText(/^Cancel Booking #\d+/)).toBeVisible({ timeout: 10_000 });
    await page.locator("#cancel-reason").fill("QA-TEST-DELETE: automated E2E test cancellation");

    const confirmBtn = page.getByRole("button", { name: "Confirm Cancellation", exact: true });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect(page.getByText("Booking Cancelled")).toBeVisible({ timeout: 10_000 });
  });
});
