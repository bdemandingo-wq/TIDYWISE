import { test as setup, expect, type Page, type APIRequestContext } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { QA_OWNER, QA_STAFF, QA_CLIENT } from "../test-credentials";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./fixtures";

/**
 * Org IDs are DERIVED here, not hardcoded in fixtures.ts.
 *
 * They used to be constants. When the QA accounts were recreated on 2026-08-13
 * the constants kept pointing at the previous accounts' orgs, so
 * cross-org-isolation.spec.ts queried organizations the live accounts had no
 * relationship to — and passed, while proving nothing. Nine green tests, two of
 * which meant anything. Same drift class as the password that was hardcoded in
 * six files. See docs/superpowers/plans/2026-08-13-test-accounts-not-provisioned.md
 *
 * Reading org_memberships from the freshly authenticated session means the
 * fixture cannot be wrong about which org an account is in.
 */
async function persistOrgContext(
  page: Page,
  request: APIRequestContext,
  role: "owner" | "staff",
): Promise<void> {
  // Lift the access token straight out of the session we just established.
  const accessToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return null;
    try {
      return JSON.parse(localStorage.getItem(key) as string).access_token as string;
    } catch {
      return null;
    }
  });
  expect(accessToken, `no Supabase access token in localStorage for ${role}`).toBeTruthy();

  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` };

  const memResp = await request.get(
    `${SUPABASE_URL}/rest/v1/org_memberships?select=organization_id,role`,
    { headers },
  );
  expect(memResp.ok(), `org_memberships lookup failed for ${role}`).toBeTruthy();
  const memberships = (await memResp.json()) as Array<{
    organization_id: string;
    role: string;
  }>;

  // No membership means the account was created but never seated in an org.
  // Every RLS-scoped read then returns zero rows, which makes isolation tests
  // pass for the wrong reason — fail here instead, where it is legible.
  expect(
    memberships.length,
    `the ${role} account has no org_memberships row. It can read nothing, so ` +
      `any isolation test using it would pass vacuously. Seat it in an org first.`,
  ).toBeGreaterThan(0);

  // Never pick a row arbitrarily. This used to be memberships[0], which is
  // whatever order PostgREST happened to return — the same silent
  // first-match-wins guess that produced a month of dead credentials, a stale
  // hardcoded org id, and a suite of hollow passes.
  const distinctOrgs = [...new Set(memberships.map((m) => m.organization_id))];
  expect(
    distinctOrgs.length,
    `the ${role} account belongs to ${distinctOrgs.length} different orgs ` +
      `(${distinctOrgs.join(", ")}). There is no correct answer to "which org is ` +
      `this account's", so refusing rather than guessing. Remove the extra ` +
      `membership, or use a dedicated single-org account for QA.`,
  ).toBe(1);

  // Resolve duplicate rows for the SAME org deterministically by privilege,
  // rather than by row order. The QA owner currently has both an `owner` and a
  // `member` row for its org — see
  // docs/superpowers/plans/2026-08-13-duplicate-org-memberships.md
  const ROLE_PRIORITY = ["owner", "admin", "manager", "member"];
  const rank = (r: string) => {
    const i = ROLE_PRIORITY.indexOf(r);
    return i === -1 ? ROLE_PRIORITY.length : i;
  };
  const chosen = [...memberships].sort((a, b) => rank(a.role) - rank(b.role))[0];

  if (memberships.length > 1) {
    console.warn(
      `[setup] ${role} has ${memberships.length} membership rows for org ` +
        `${chosen.organization_id} (roles: ${memberships.map((m) => m.role).join(", ")}). ` +
        `Using the most privileged, "${chosen.role}". Duplicate memberships can ` +
        `confuse any is_org_admin-style check that reads the first match.`,
    );
  }

  const organizationId = chosen.organization_id;

  // staffId is best-effort: only the staff account is expected to have a row,
  // and security.spec.ts needs a REAL one to prove a spoofed org is rejected.
  let staffId: string | null = null;
  const staffResp = await request.get(`${SUPABASE_URL}/rest/v1/staff?select=id&limit=1`, {
    headers,
  });
  if (staffResp.ok()) {
    const rows = (await staffResp.json()) as Array<{ id: string }>;
    staffId = rows[0]?.id ?? null;
  }

  mkdirSync("tests/.auth", { recursive: true });
  writeFileSync(
    `tests/.auth/${role}-org.json`,
    JSON.stringify(
      { organizationId, role: chosen.role, staffId, derivedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    `[setup] ${role}: org=${organizationId} role=${chosen.role} staffId=${staffId ?? "none"}`,
  );
}

/**
 * Logs in as each of the 3 QA roles once and saves storageState so the
 * rest of the suite doesn't re-login per test. Re-run whenever a session
 * goes stale:
 *   npx playwright test -c playwright.qa.config.ts --project=setup
 *
 * Route/selector facts below are verified against the live app (not
 * guessed) — see e2e/login.spec.ts and playwright-fixture.ts for the
 * owner/client pattern this reuses, and tests/README.md for the staff
 * route source.
 */

// From .env.test via ../test-credentials. All three are required for this
// project to pass, and a missing one throws with instructions rather than
// skipping — a silent skip here is what hid the last credential breakage.
const OWNER = QA_OWNER;
const STAFF = QA_STAFF;
const CLIENT = QA_CLIENT;

setup("authenticate as owner", async ({ page, request }) => {
  await page.goto("/login");
  await page.locator("#email").fill(OWNER.email);
  await page.locator("#password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 20_000 });
  await page.waitForTimeout(1800); // SplashScreen minDuration before dashboard actually mounts
  await expect(page).toHaveURL(/\/dashboard/);
  // Belt-and-suspenders alongside the splash-screen wait above — see the
  // staff step below for why a URL/fixed-delay check alone isn't trusted
  // here for the actual localStorage write.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
  await page.context().storageState({ path: "tests/.auth/owner.json" });
  await persistOrgContext(page, request, "owner");
});

setup("authenticate as staff", async ({ page, request }) => {
  await page.goto("/staff/login");
  await page.locator("#email").fill(STAFF.email);
  await page.locator("#password").fill(STAFF.password);
  await page.getByRole("button", { name: "Sign In to Portal", exact: true }).click();
  await page.waitForURL("**/staff**", { timeout: 20_000 });
  await expect(page).toHaveURL(/\/staff/);
  // BUG FOUND 2026-07-14: capturing storageState immediately after the URL
  // matches raced ahead of supabase-js actually persisting the session to
  // localStorage, producing a staff.json with NO sb-*-auth-token key at
  // all (confirmed by inspecting the captured file directly) — every test
  // using staffPage then started with no session. Poll for the real
  // Supabase auth key to actually exist before saving, instead of trusting
  // a fixed delay or the URL alone.
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
    { timeout: 10_000 },
  );
  await page.context().storageState({ path: "tests/.auth/staff.json" });
  await persistOrgContext(page, request, "staff");
});

setup("authenticate as client", async ({ page }) => {
  await page.goto("/portal/login");
  await page.locator("#email").fill(CLIENT.email);
  await page.locator("#password").fill(CLIENT.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByText("Welcome back!")).toBeVisible({ timeout: 10_000 });
  await page.waitForURL("**/portal/dashboard**", { timeout: 20_000 });
  // Client portal auth is a custom localStorage session (key
  // client_portal_session), not Supabase cookies — storageState captures
  // localStorage per-origin, so this still round-trips correctly. Poll for
  // the key directly rather than trusting the URL alone (see the staff
  // step above for why that trust was misplaced there).
  await page.waitForFunction(() => localStorage.getItem("client_portal_session") !== null, { timeout: 10_000 });
  await page.context().storageState({ path: "tests/.auth/client.json" });
});
