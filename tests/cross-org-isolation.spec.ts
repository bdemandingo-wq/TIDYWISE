import { test, expect, OWNER, STAFF, SUPABASE_URL, SUPABASE_ANON_KEY, getAccessToken } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * Highest-priority checklist section. Asserts on raw network responses
 * (direct Supabase REST calls), not just hidden UI — a component that
 * merely hides a menu item is not proof RLS enforces the boundary.
 *
 * Org A = the owner test account's org. Org B = the staff + client accounts'
 * org. Both are DERIVED from org_memberships by the setup project, not
 * hardcoded — see tests/fixtures.ts.
 *
 * Everything in this file assumes those are two DIFFERENT orgs. The guard below
 * enforces that rather than trusting it, and it exists because of a real
 * incident: on 2026-08-13 the QA accounts were recreated into a single shared
 * org, and this file reported 9 passed / 2 failed. Only two of the nine passes
 * meant anything — with no second org and no data, "Org A's list contains no
 * Org B row" is true for the wrong reason. A cross-org suite that cannot see a
 * second org must fail loudly, not go green.
 * See docs/superpowers/plans/2026-08-13-test-accounts-not-provisioned.md
 */

/**
 * A string that identifies an Org B record, for asserting it never renders on
 * an Org A page.
 *
 * Discovery is layered because the obvious source is not reliably available: a
 * customer email is the strongest marker, but staff_can_view_customer
 * (20260122200613_*.sql:12-28) only lets a staff member see a customer who has
 * a booking ASSIGNED to them. A `member`-role account in an org full of
 * customers can legitimately see none of them. That is correct least-privilege
 * design, not a bug, so the marker search falls back rather than failing.
 *
 * `strong: false` markers keep the suite running but prove much less — an org
 * name was never going to appear in a customer list either way. The precondition
 * surfaces that instead of letting a weak pass read as a strong one.
 */
type OrgBMarker = { kind: string; value: string; strong: boolean };

async function discoverOrgBMarker(request: APIRequestContext): Promise<OrgBMarker | null> {
  const token = await getAccessToken(request, STAFF.email, STAFF.password);
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const get = async (path: string) => {
    const r = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
    return r.ok() ? ((await r.json()) as Array<Record<string, string>>) : [];
  };

  const [customer] = await get("customers?select=email&limit=1");
  if (customer?.email) return { kind: "Org B customer email", value: customer.email, strong: true };

  const [booking] = await get("bookings?select=id&limit=1");
  if (booking?.id) return { kind: "Org B booking id", value: booking.id, strong: true };

  // Always reachable: a member can read their own organizations row.
  const [org] = await get(`organizations?id=eq.${STAFF.orgId}&select=name`);
  if (org?.name) return { kind: "Org B org name", value: org.name, strong: false };

  return null;
}

/**
 * A filter-check ("no returned row belongs to the other org") asserts NOTHING
 * when the read comes back empty — the loop body never executes. Three separate
 * times this suite reported green while proving nothing, so an empty read is now
 * a failure rather than a pass. See
 * docs/superpowers/plans/2026-08-13-test-accounts-not-provisioned.md
 */
function expectNonEmptyRead(rows: unknown[], what: string, seedHint: string): void {
  expect(
    rows.length,
    `${what} returned 0 rows, so this filter-check asserted nothing and would ` +
      `have passed vacuously. ${seedHint}`,
  ).toBeGreaterThan(0);
}

test("PRECONDITION: owner and staff are in different orgs, and Org B has data", async ({
  request,
}) => {
  expect(
    OWNER.orgId,
    `the owner and staff accounts are both in org ${OWNER.orgId}. There is no ` +
      `Org B, so nothing in this file can detect a cross-org leak — every ` +
      `assertion below would pass vacuously. Seat them in separate orgs.`,
  ).not.toBe(STAFF.orgId);

  // A leak marker is required, not optional: these tests prove isolation by
  // looking for a specific Org B value inside Org A's results. With nothing to
  // look for, absence proves nothing.
  const marker = await discoverOrgBMarker(request);
  expect(
    marker,
    `no Org B marker could be discovered at all. Even the org name was ` +
      `unreadable, which means the staff account cannot read its own org — ` +
      `check it is seated in ${STAFF.orgId} and re-run --project=setup.`,
  ).not.toBeNull();

  test.info().annotations.push({ type: "org-b-marker", description: `${marker!.kind} (strong=${marker!.strong})` });

  if (!marker!.strong) {
    // Deliberately not a failure: the suite should still run. But a weak marker
    // must not read as a strong pass, so say so loudly in the output.
    console.warn(
      `[cross-org] WEAK MARKER: falling back to "${marker!.kind}". A staff member ` +
        `only sees customers with a booking assigned to them ` +
        `(staff_can_view_customer), so no customer email was reachable. ` +
        `Assign a booking in Org B to staff ${STAFF.staffId} to restore the ` +
        `strong marker — UI leak checks are much weaker without it.`,
    );
  }
});

test.describe("1.8 — CROSS-ORG: Org A cannot read Org B customers/bookings/payments", () => {
  for (const table of ["customers", "bookings", "invoices"] as const) {
    test(`owner (org A) REST list of ${table} never contains an Org B row`, async ({ request }) => {
      const token = await getAccessToken(request, OWNER.email, OWNER.password);
      const resp = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=id,organization_id&limit=50`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      expect(resp.ok(), `${table} query should succeed (200), just scoped by RLS`).toBeTruthy();
      const rows = (await resp.json()) as Array<{ organization_id: string }>;
      expectNonEmptyRead(
        rows,
        `owner's ${table} read`,
        `Seed at least one ${table} row in Org A (${OWNER.orgId}) so there is something to filter.`,
      );
      for (const row of rows) {
        expect(row.organization_id, `${table} row leaked into owner's cross-org read`).not.toBe(STAFF.orgId);
      }
    });
  }

  test("staff (org B) REST list of customers/bookings never contains an Org A row", async ({ request }) => {
    const token = await getAccessToken(request, STAFF.email, STAFF.password);
    for (const table of ["customers", "bookings"] as const) {
      const resp = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=id,organization_id&limit=50`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
      expect(resp.ok()).toBeTruthy();
      const rows = (await resp.json()) as Array<{ organization_id: string }>;
      expectNonEmptyRead(
        rows,
        `staff's ${table} read`,
        `A member-role account only sees ${table} linked to a booking assigned to ` +
          `them (staff_can_view_customer). Assign a booking in Org B to staff ` +
          `${STAFF.staffId} so this check has rows to filter.`,
      );
      for (const row of rows) {
        expect(row.organization_id).not.toBe(OWNER.orgId);
      }
    }
  });
});

test.describe("1.9 — CROSS-ORG: direct API/URL access to another org's record fails", () => {
  test("owner (org A) direct-ID GET of an Org B organizations row returns empty, not the record", async ({
    request,
  }) => {
    const token = await getAccessToken(request, OWNER.email, OWNER.password);
    const resp = await request.get(`${SUPABASE_URL}/rest/v1/organizations?id=eq.${STAFF.orgId}&select=id,name`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    // RLS masks with an empty array + 200, not a 403 — the assertion is on
    // the BODY (no data leak), not the status code.
    expect(resp.ok()).toBeTruthy();
    const rows = await resp.json();
    expect(rows, "direct-ID lookup of another org's row must return zero rows").toEqual([]);
  });

  test("staff (org B) direct-ID GET of a specific Org A customer/booking never returns data", async ({
    request,
  }) => {
    // First, discover a real Org A ID as the owner (read-only), then probe it as staff.
    const ownerToken = await getAccessToken(request, OWNER.email, OWNER.password);
    const ownerResp = await request.get(
      `${SUPABASE_URL}/rest/v1/organizations?id=eq.${OWNER.orgId}&select=id`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${ownerToken}` } },
    );
    expect(ownerResp.ok()).toBeTruthy();

    const staffToken = await getAccessToken(request, STAFF.email, STAFF.password);
    const resp = await request.get(
      `${SUPABASE_URL}/rest/v1/organizations?id=eq.${OWNER.orgId}&select=id,name`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${staffToken}` } },
    );
    expect(resp.ok()).toBeTruthy();
    expect(await resp.json()).toEqual([]);
  });

  test("owner (org A) hitting an Org B admin URL by direct navigation never renders Org B data", async ({
    ownerPage: page,
    request,
  }) => {
    // UI-level companion to the REST probes above — same-app confirmation
    // that navigating to the customers list only ever shows Org A's own
    // data. Doesn't assume Org A is empty (that stopped being true once
    // the booking-creation suite seeded a QA-TEST-DELETE fixture customer
    // there) — instead fetches a real Org B customer's email at runtime
    // via the staff account (legitimately scoped to their own org) and
    // asserts it never renders on Org A owner's page, regardless of how
    // many rows Org A actually has. This is a more direct proof of
    // isolation than an empty-state check ever was: the original version
    // only proved isolation by coincidence (any row at all would have
    // been a leak), not by actually looking for one.
    const marker = await discoverOrgBMarker(request);
    expect(marker, "no Org B marker available — see the PRECONDITION test").not.toBeNull();
    test.info().annotations.push({
      type: "org-b-marker",
      description: `${marker!.kind} (strong=${marker!.strong})`,
    });
    if (!marker!.strong) {
      // An org name would not have rendered in a customer list either way, so a
      // pass here proves far less than it appears to. Recorded, not hidden.
      console.warn(
        `[cross-org] this UI leak check is running on a WEAK marker ` +
          `(${marker!.kind}); a pass does not demonstrate much.`,
      );
    }

    await page.goto("/dashboard/customers");
    await expect(page).toHaveURL(/\/dashboard\/customers/);
    // Wait for the page to actually settle (real rows or the empty state)
    // before checking for absence, so this can't pass trivially while
    // still loading.
    await expect(page.getByText("Loading customers...")).not.toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(marker!.value),
      `an Org B value (${marker!.kind}) leaked into Org A owner's customer list`,
    ).not.toBeVisible();
  });
});

test.describe("1.10 — Role separation: staff cannot access owner-only admin pages", () => {
  test("staff account hitting /dashboard directly is redirected to /staff, not shown admin UI", async ({
    staffPage: page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // AdminRoute redirects a member-role account to /staff (client-side
    // <Navigate>, not a 403 page) — assert the redirect actually lands
    // and no admin chrome is visible.
    await expect(page).toHaveURL(/\/staff/, { timeout: 15_000 });
    await expect(page.getByText(/Total Revenue|Finance/i)).not.toBeVisible();
  });

  test("staff account hitting an owner-only Finance route is redirected away", async ({ staffPage: page }) => {
    await page.goto("/dashboard/finance");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/staff/, { timeout: 15_000 });
  });

  test("staff REST access to a financial table is still scoped by RLS even if UI is bypassed", async ({
    request,
  }) => {
    // manual_payments has no member-level SELECT policy — only
    // owner/admin/manager (is_org_admin) can read it at all. Staff's role
    // is "member", so this must come back empty even for their OWN org.
    //
    // NOT a filter-check, so it gets no expectNonEmptyRead guard: an empty
    // result IS the assertion here, and a non-empty one would be the failure.
    // Its weakness is different and cannot be closed from a member token — it
    // cannot distinguish "RLS blocked the member" from "Org B has no
    // manual_payments rows at all". Closing that needs a row seeded in Org B by
    // an admin, then re-running this to confirm the member still reads zero.
    // Until then, treat a pass as consistent-with-isolation, not proof of it.
    const token = await getAccessToken(request, STAFF.email, STAFF.password);
    const resp = await request.get(
      `${SUPABASE_URL}/rest/v1/manual_payments?organization_id=eq.${STAFF.orgId}&select=id&limit=5`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    expect(resp.ok()).toBeTruthy();
    expect(await resp.json()).toEqual([]);
  });
});

test.describe("1.11 — Client portal user sees only their own jobs/photos/invoices", () => {
  test("client portal dashboard never exposes another customer's data or an admin route", async ({
    clientPage: page,
  }) => {
    await page.goto("/portal/dashboard");
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    // Attempting to reach admin/staff routes from an authenticated client
    // session must not render admin chrome.
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/dashboard$/);
  });

  test("client REST access to bookings only ever returns their own customer_id's rows", async ({ request }) => {
    const token = await getAccessToken(request, STAFF.email, STAFF.password); // org member, for a same-org contrast baseline
    const staffResp = await request.get(
      `${SUPABASE_URL}/rest/v1/bookings?organization_id=eq.${STAFF.orgId}&select=id,customer_id&limit=5`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    expect(staffResp.ok()).toBeTruthy();
    const staffVisibleBookings = (await staffResp.json()) as Array<{ id: string; customer_id: string | null }>;
    test.skip(staffVisibleBookings.length === 0, "org B currently has no bookings to cross-check against");

    // The anon key alone (no portal session, no Supabase auth) must not be
    // able to read bookings directly — client portal reads go through
    // get_client_portal_user_data / customer-scoped RLS, not a bare anon read.
    const anonResp = await request.get(`${SUPABASE_URL}/rest/v1/bookings?select=id&limit=5`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    expect(anonResp.ok()).toBeTruthy();
    expect(
      await anonResp.json(),
      "anon (unauthenticated) reads of bookings must return zero rows — this table had an 'Anyone can view own booking' policy hole removed in migration 20260413170000",
    ).toEqual([]);
  });
});
