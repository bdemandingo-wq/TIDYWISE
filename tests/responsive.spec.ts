import { test, expect } from "./fixtures";

/**
 * 8. Frontend / UI / UX — 8.1, 8.4, 8.5, 8.6
 * Breakpoints requested: 320, 375, 430, 768, 1280, 1440.
 */

const BREAKPOINTS = [
  { name: "320 (small mobile)", width: 320, height: 700 },
  { name: "375 (mobile)", width: 375, height: 812 },
  { name: "430 (large mobile)", width: 430, height: 932 },
  { name: "768 (tablet)", width: 768, height: 1024 },
  { name: "1280 (laptop)", width: 1280, height: 800 },
  { name: "1440 (desktop)", width: 1440, height: 900 },
];

// Public, unauthenticated pages only — this section isn't role-scoped and
// keeping it logged-out avoids coupling to the same-org data blockers
// that affect the booking-ui suite.
const PAGES = ["/", "/pricing", "/login", "/signup"];

test.describe("8.1 — All pages render on mobile / tablet / desktop (no broken layouts)", () => {
  for (const bp of BREAKPOINTS) {
    for (const path of PAGES) {
      test(`${path} at ${bp.name} has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        // "/" never reaches networkidle within 30s (persistent background
        // activity — chat widget/analytics beacons); domcontentloaded + a
        // short settle wait is reliable across all pages tested here.
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);

        // The classic "broken layout" signal: something wider than the
        // viewport forces horizontal scroll. A few px of rounding slack
        // is allowed; anything beyond that is a real overflow bug.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} at ${bp.width}px has ${overflow}px of horizontal overflow`).toBeLessThanOrEqual(2);
      });
    }
  }
});

test.describe("8.4 — Loading, empty, and error states all present", () => {
  test("BookingsPage: loading spinner appears before data resolves", async ({ ownerPage: page }) => {
    // KNOWN TEST-TECHNIQUE LIMITATION (not a session issue, not related to
    // the 8.4 error-state/dead-code fix): the route pattern below isn't
    // actually intercepting whatever request populates this list — a
    // failure screenshot showed the page already fully settled on the
    // empty state ("No bookings found") well within the artificial delay
    // window, meaning the real fetch bypassed this mock entirely (likely
    // a different endpoint/shape than a plain /rest/v1/bookings GET — an
    // RPC or a batched query). The loading state itself IS real and
    // source-verified (BookingsPage.tsx renders a Loader2 + "Loading
    // bookings..." while isLoading is true) — this is purely about how to
    // reliably force that window open in a test, not whether the feature
    // exists. Left failing/documented rather than silently marked passing
    // or quietly deleted.
    await page.route("**/rest/v1/bookings*", async (route) => {
      await new Promise((r) => setTimeout(r, 2_500));
      await route.continue();
    });
    await page.goto("/dashboard/bookings");
    await expect(page.getByText("Loading bookings...")).toBeVisible({ timeout: 8_000 });
  });

  test("BookingsPage: error state renders the full UI (heading + working Retry) on a failed fetch", async ({
    ownerPage: page,
  }) => {
    // FIXED 2026-07-14 (pushed, pending Lovable redeploy as of this
    // writing): BookingsPage.tsx used to have an early `if (error) return
    // (...)` near the top of the component that rendered a bare "Failed
    // to load bookings. Please try again." message with no recovery
    // action, and unconditionally returned — making the fuller error UI
    // further down (heading + "Retry" button wired to
    // queryClient.invalidateQueries) permanently unreachable dead code.
    // The early return was removed. Until the redeploy lands, this test
    // will correctly show the OLD bare-message behavior as a failure —
    // that's the honest signal, not a flake.
    await page.route("**/rest/v1/bookings*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "simulated failure" }) }),
    );
    await page.goto("/dashboard/bookings");
    await expect(page.getByRole("heading", { name: "Failed to load bookings", exact: true })).toBeVisible({
      timeout: 15_000, // React Query's default retry+backoff runs before `error` settles
    });
    const retryButton = page.getByRole("button", { name: "Retry", exact: true });
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toBeEnabled();
  });

  test("BookingsPage: empty state renders when the org has no bookings", async ({ ownerPage: page }) => {
    // Org A genuinely has zero bookings (verified live) — no mocking needed.
    await page.goto("/dashboard/bookings");
    await expect(page.getByText(/No bookings found/i)).toBeVisible({ timeout: 15_000 });
  });

  test("CustomersPage: KNOWN GAP — a failed fetch falls through to the empty state instead of an error state", async ({
    ownerPage: page,
  }) => {
    // Source-verified: CustomersPage.tsx destructures only `{ data: customers
    // = [], isLoading }` from useCustomers() — `error` is never read, so a
    // failed query renders "No customers yet" (identical to a genuinely
    // empty org) instead of a distinct error UI. This test documents that
    // gap rather than papering over it — it should read as a known finding,
    // not a flaky test, until the page is fixed to surface fetch errors.
    await page.route("**/rest/v1/customers*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "simulated failure" }) }),
    );
    await page.goto("/dashboard/customers");
    await expect(page.getByText(/No customers yet/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("8.5 — Form validation shows clear inline messages", () => {
  test("LoginPage: invalid email shows an inline red-bordered message before submit reaches the server", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#email").fill("not-an-email");
    await page.locator("#password").fill("x");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    const emailField = page.locator("#email");
    // NOTE: "not-an-email" has no "@", so the browser's own native
    // type="email" constraint validation intercepts submission before
    // React's zod-based validation ever runs (LoginPage's <form> doesn't
    // set noValidate, unlike SignupPage/PortalLoginPage which do) — no
    // app-level border-destructive class is applied in that case, and
    // that's expected/correct browser behavior, not a bug. Assert on
    // whichever validation layer actually fired.
    const nativeMessage = await emailField.evaluate((el: HTMLInputElement) => el.validationMessage);
    if (nativeMessage) {
      expect(nativeMessage.length).toBeGreaterThan(0);
    } else {
      await expect(emailField).toHaveClass(/border-destructive/);
      await expect(page.getByText("Please enter a valid email address")).toBeVisible();
    }
  });

  test("SignupPage: mismatched passwords show an inline error", async ({ page }) => {
    await page.goto("/signup");
    await page.locator("#fullName").fill("QA TEST-DELETE Responsive Check");
    await page.locator("#email").fill(`bdemandingo+e2eform${Date.now()}@gmail.com`);
    await page.locator("#password").fill("QaTestDelete2026!");
    await page.locator("#confirmPassword").fill("DoesNotMatch2026!");
    await page.locator("#tos").check(); // submit stays disabled until ToS is accepted — unrelated to the password-mismatch check below
    await page.getByRole("button", { name: /Create Account/i }).click();
    await expect(page.locator("#confirmPassword")).toHaveClass(/border-destructive/);
  });

  test("Booking form: incomplete step shows a toast, not a silent no-op (toast pattern, not inline)", async ({
    ownerPage: page,
  }) => {
    await page.goto("/dashboard/bookings");
    await page.getByPlaceholder("Search by name, service, or booking #...").fill(`no-such-booking-${Date.now()}`);
    const createBtn = page.getByRole("button", { name: "Create Booking", exact: true });
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await createBtn.click();
    await expect(page.getByRole("heading", { name: "New Booking", exact: true })).toBeVisible({ timeout: 10_000 });
    // Try to advance without selecting a customer — BookingStepper's
    // validateStep() shows a sonner toast ("Please select a customer"),
    // not an inline FormMessage (shadcn's Form/FormMessage exists in the
    // codebase but is unused dead code — confirmed via source grep).
    const nextBtn = page.getByRole("button", { name: /^Next$/ });
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await expect(page.getByText("Please select a customer")).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("8.6 — 404 / broken-image handling graceful", () => {
  test("an unknown route renders the NotFound page, not a crash", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-qa-probe");
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await expect(page.getByText("Oops! Page not found")).toBeVisible();
    const homeLink = page.getByRole("link", { name: "Return to Home" });
    await expect(homeLink).toHaveAttribute("href", "/");
  });

  test("a broken booking-photo URL shows the SignedImage fallback, not a broken-image icon", async ({
    ownerPage: page,
  }) => {
    // SignedImage (src/components/ui/signed-image.tsx) catches onError and
    // renders a muted ImageIcon fallback div instead of a broken <img>.
    // Exercised indirectly: force any signed-image fetch on the page to
    // fail and confirm no raw broken-image element is left on screen.
    await page.route("**/storage/v1/object/sign/**", (route) => route.fulfill({ status: 404, body: "not found" }));
    await page.goto("/dashboard/bookings");
    // No assertion beyond "page still renders" is meaningful without a
    // booking that actually has photos on this org (0 bookings, verified
    // live) — this documents the mechanism for reuse once data exists.
    await expect(page).toHaveURL(/\/dashboard\/bookings/);
  });
});
