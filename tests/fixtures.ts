import { test as base, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";

export const OWNER = {
  email: "support+paywalltest2@tidywisecleaning.com",
  password: "TestPaywall2026!",
  orgId: "0f329006-ac99-46b1-83d1-632c6a1bb355", // "hu" — trial plan, 0 customers/bookings
};
export const STAFF = {
  email: "bdemandingo+staff@gmail.com",
  password: "tidywise123",
  orgId: "e95b92d0-7099-408e-a773-e4407b34f8b4", // "TIDYWISE" — lifetime plan, real seeded data
  staffId: "4ec567a3-d2f4-47b1-bee9-de7dbfced820",
};
export const CLIENT = {
  email: "bdemandingo+client@gmail.com",
  password: "tidywise123",
  orgId: STAFF.orgId, // same org as the staff test account
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
