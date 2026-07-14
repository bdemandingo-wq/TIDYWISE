/**
 * Flow 5: Payment actions on a booking — Charge Card, Place Hold, Payment History.
 *
 * BLOCKED — skipped for now, same root cause as admin-bookings.spec.ts:
 * this suite needs to create its own booking first, which isn't possible
 * on the QA org (zero existing customers, new-customer creation RLS-gated
 * behind an active subscription). Remove `.skip` once unblocked.
 *
 * Uses its own throwaway booking (separate from the one in
 * admin-bookings.spec.ts, so this suite is independent and never runs
 * against an already-cancelled booking), attached to an existing
 * (unmodified) customer — see admin-bookings.spec.ts header for why.
 *
 * IMPORTANT SCOPE NOTE: "Charge Card Now" and "Place Hold" both trigger a
 * real Stripe transaction on confirmation. Per this project's standing
 * rule against real financial transactions in test runs, these tests
 * verify the button exists, is enabled, and correctly opens its
 * confirmation dialog — then dismiss via "Cancel" without ever clicking
 * "Yes, Charge Now" / "Yes, Place Hold". Only "Payment History" (read-only)
 * is exercised end-to-end.
 */
import { test, expect } from "@playwright/test";
import { loginAsOwner, createTestBooking, findBookingRow, openRowMenu } from "./helpers/admin";

test.describe.skip("Admin payment actions on a booking", () => {
  let bookingNumber: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsOwner(page);
    const result = await createTestBooking(page);
    bookingNumber = result.bookingNumber;
    await page.close();
  });

  test("Charge Card Now: exists, opens Confirm Charge dialog when enabled (not confirmed)", async ({
    page,
  }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    const menu = await openRowMenu(page, row);

    const chargeItem = menu.getByText(/Charge Card Now|Already Paid/);
    await expect(chargeItem).toBeVisible();
    const text = await chargeItem.textContent();

    if (text?.includes("Already Paid")) {
      // Disabled by design once payment_status is 'paid' — not a bug.
      await expect(chargeItem).toBeDisabled();
      return;
    }

    if (await chargeItem.isDisabled()) {
      // Correctly disabled when the attached customer has no email on file.
      test.skip(true, "Charge Card Now disabled — attached customer has no email on file");
      return;
    }

    await expect(chargeItem).toBeEnabled();
    await chargeItem.click();

    await expect(page.getByText("Confirm Charge", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Yes, Charge Now", exact: true })).toBeVisible();

    // Dismiss WITHOUT confirming — see file header.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Confirm Charge", { exact: true })).not.toBeVisible();
  });

  test("Place Hold: exists, enabled, opens Confirm Place Hold dialog (not confirmed)", async ({
    page,
  }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    const menu = await openRowMenu(page, row);

    const placeHoldItem = menu.getByText("Place Hold", { exact: true });
    const visible = await placeHoldItem.isVisible().catch(() => false);
    if (!visible) {
      // Only rendered when there's no existing payment_intent_id and the
      // booking isn't already paid. If a prior test in this run already
      // placed a hold or charged the card, this action correctly disappears.
      test.skip(true, "Place Hold not offered for this booking's current payment state");
      return;
    }

    await expect(placeHoldItem).toBeEnabled();
    await placeHoldItem.click();

    await expect(page.getByText("Confirm Place Hold", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Yes, Place Hold", exact: true })).toBeVisible();

    // Dismiss WITHOUT confirming — see file header.
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Confirm Place Hold", { exact: true })).not.toBeVisible();
  });

  test("Payment History: exists, enabled, opens and shows the booking's history", async ({
    page,
  }) => {
    await loginAsOwner(page);
    const row = await findBookingRow(page, bookingNumber);
    const menu = await openRowMenu(page, row);

    const historyItem = menu.getByText("Payment History", { exact: true });
    await expect(historyItem).toBeVisible();
    await expect(historyItem).toBeEnabled();
    await historyItem.click();

    await expect(page.getByText("Payment History", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
  });
});
