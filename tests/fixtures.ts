import { test as base, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { QA_OWNER, QA_STAFF, QA_CLIENT } from "../test-credentials";

// Credentials come from .env.test via ../test-credentials — never hardcoded.
// The email/password fields are getters so that importing this file with no
// credentials configured still works: the anon-key specs (security, seo-static,
// the contract specs) import SUPABASE_URL/ANON_KEY from here and must keep
// running. Reading a missing credential throws loudly at that point instead.
interface DerivedOrgContext {
  organizationId: string;
  role: string;
  staffId: string | null;
  derivedAt: string;
}

/**
 * Org context is DERIVED by the setup project from org_memberships, not
 * hardcoded here.
 *
 * These used to be constants. When the QA accounts were recreated on
 * 2026-08-13 the constants kept pointing at the previous accounts' orgs, so
 * cross-org-isolation.spec.ts queried organizations the live accounts had no
 * relationship to — and passed, proving nothing. Nine green tests, two of which
 * meant anything. Same drift class as the password that lived in six files.
 * See docs/superpowers/plans/2026-08-13-test-accounts-not-provisioned.md
 */
function derivedOrg(role: "owner" | "staff"): DerivedOrgContext {
  const path = `tests/.auth/${role}-org.json`;
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing, so this test does not know which organization the ` +
        `${role} account belongs to.\n\nRun the setup project first:\n` +
        `    npx playwright test -c playwright.qa.config.ts --project=setup\n\n` +
        `Org IDs are derived from org_memberships at setup time rather than ` +
        `hardcoded, because a hardcoded ID silently pointed at the wrong org ` +
        `after the accounts were recreated.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as DerivedOrgContext;
}

export const OWNER = {
  get email() { return QA_OWNER.email; },
  get password() { return QA_OWNER.password; },
  get orgId() { return derivedOrg("owner").organizationId; },
};
export const STAFF = {
  get email() { return QA_STAFF.email; },
  get password() { return QA_STAFF.password; },
  get orgId() { return derivedOrg("staff").organizationId; },
  get staffId() {
    const id = derivedOrg("staff").staffId;
    if (!id) {
      throw new Error(
        "the staff account has no row in public.staff, so there is no real " +
          "staffId to spoof an org against. security.spec.ts's spoofed-value " +
          "checks need one. Add a staff row for this account and re-run setup.",
      );
    }
    return id;
  },
};
export const CLIENT = {
  get email() { return QA_CLIENT.email; },
  get password() { return QA_CLIENT.password; },
  // The client portal account belongs to the staff account's org.
  get orgId() { return derivedOrg("staff").organizationId; },
};

export const SUPABASE_URL = "https://slwfkaqczvwvvvavkgpr.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";

type Fixtures = {
  ownerPage: Page;
  staffPage: Page;
  clientPage: Page;
};
type WorkerFixtures = {
  ownerContext: BrowserContext;
  staffContext: BrowserContext;
  clientContext: BrowserContext;
};

/**
 * Auth contexts are WORKER-scoped (created once per worker, reused across
 * every test), not per-test. Supabase rotates refresh tokens on use — if
 * every test spun up its own fresh browser context from the same static
 * tests/.auth/*.json snapshot, the first context to refresh would rotate
 * the token and silently invalidate it for every other context still
 * holding the old one, logging them out mid-suite (this is exactly what
 * happened the first time this suite ran: session-dependent tests failed
 * scattered throughout the run with no code changes and no real bug).
 * One context per role per worker means only that one context's own
 * in-memory refresh cycle is ever in play.
 */
export const test = base.extend<Fixtures, WorkerFixtures>({
  ownerContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ storageState: "tests/.auth/owner.json" });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  staffContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ storageState: "tests/.auth/staff.json" });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  clientContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ storageState: "tests/.auth/client.json" });
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  ownerPage: async ({ ownerContext }, use) => {
    const page = await ownerContext.newPage();
    await use(page);
    await page.close();
  },
  staffPage: async ({ staffContext }, use) => {
    const page = await staffContext.newPage();
    await use(page);
    await page.close();
  },
  clientPage: async ({ clientContext }, use) => {
    const page = await clientContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };

/** Signs in via the Supabase Auth REST API and returns an access token — for tests that need a
 *  raw bearer token (network-response assertions) rather than a full browser session. */
export async function getAccessToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const resp = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(resp.ok(), `auth failed for ${email}: ${await resp.text()}`).toBeTruthy();
  const body = await resp.json();
  return body.access_token as string;
}

/** Signs in via the client-portal-login edge function and returns the signed session token. */
export async function getPortalSessionToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const resp = await request.post(`${SUPABASE_URL}/functions/v1/client-portal-login`, {
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(resp.ok(), `portal login failed for ${email}: ${await resp.text()}`).toBeTruthy();
  const body = await resp.json();
  expect(body.valid, "portal login returned valid=false").toBeTruthy();
  return body.session_token as string;
}
