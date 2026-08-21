// Contract test: the broadcast audience must come from organizations.owner_id
// joined to auth.users.email — never from org_memberships.role = 'owner'.
//
// THE BUG THIS EXISTS TO CATCH. Verified live 2026-08-15:
// organizations.owner_id -> auth.users.email yields 96 organizations and 96
// distinct owner emails, a clean 1:1. Resolving the same audience via
// org_memberships.role = 'owner' instead yields only 93 — three organizations
// hold their owner seated as role='member' in org_memberships, not
// role='owner'. A membership-based query would silently drop those three
// from every broadcast: no error, no visible symptom short of "why didn't
// org X get the email." That is the single most dangerous silent failure in
// this feature, and the whole point of this file is to catch it if the
// underlying function (or a future rewrite of it) is ever built on the
// wrong table.
//
// WHY THE COUNT ISN'T HARDCODED, AND WHY IT ISN'T A DIRECT TABLE READ EITHER.
// The first test below asserts the audience row count equals a live
// organization total, not the literal 96 — 96 is a snapshot of today's
// customer base, not an invariant, and hardcoding it would make this test
// fail on the very next signup and teach everyone to ignore it. That total
// is read from the platform-analytics edge function rather than a client-side
// `count(*)` on organizations, because organizations' only SELECT policy is
// `owner_id = auth.uid() OR is_org_member(id)` — there is no platform-admin
// bypass, so a client-side count as the platform admin sees only their own
// org(s), not the real total (see the inline comment at that call for the
// live numbers this was verified against). The 93-vs-96 gap this file guards
// against only shows up as "audience count equals the real organization
// total," never as a magic number.
//
// SECURITY DEFINER GATE. broadcast_audience(p_message_class text) is
// SECURITY DEFINER and gates internally on is_platform_admin() (see
// supabase/migrations/20260815111615_*.sql). Because it's SECURITY DEFINER,
// a caller who fails that check doesn't get a permissions error back — the
// function still executes as its owner, so the only observable difference is
// the row set. That makes the third test below the important one: it proves
// a non-platform-admin caller gets back ZERO rows, not an error and not the
// real audience.
//
// MESSAGE-CLASS BEHAVIOR. A marketing-class broadcast currently has 95
// eligible / 1 skipped (skip_reason = 'unsubscribed'); a transactional-class
// one has all 96 eligible, because transactional never honors the
// unsubscribe/suppression list.
//
// CREDENTIALS. This spec needs two real sessions: a platform admin
// (PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD) and an ordinary org owner
// who is NOT a platform admin (QA_ORG_OWNER_EMAIL / QA_ORG_OWNER_PASSWORD).
// PLATFORM_ADMIN_EMAIL must specifically be support@tidywisecleaning.com:
// is_platform_admin() allows two addresses, but the platform-analytics
// oracle this test calls gates on that one address only
// (platform-analytics/index.ts:10,74) — the other admin address would get a
// 403 from the oracle itself, for a reason unrelated to the audience.
// QA_ORG_OWNER is deliberately a separate pair from the QA_OWNER used
// elsewhere in tests/ — test 3 is only meaningful if that account is
// genuinely not a platform admin, which nothing in the repo asserts about
// QA_OWNER. Neither pair is one of the three existing tests/.auth/*.json QA
// roles, so both come from their own env vars, following the same
// gitignored-.env.test + loud-throw-if-missing pattern as
// ../test-credentials.ts (see tests/README.md and .env.test.example). Do NOT
// hardcode either credential here — see
// docs/superpowers/plans/2026-08-13-dead-test-credentials.md for what
// hardcoding test credentials costs.
//
// Read-only: every call in this file is a SELECT-shaped RPC, a read-only
// edge-function invoke (platform-analytics), or a table read.
//
// Runs standalone, no setup project needed (talks to Supabase directly via
// supabase-js, not through the app UI). It has its own dependency-free
// Playwright project — "broadcast-audience-contract" — in
// playwright.qa.config.ts, and runs automatically as part of
// `npm run test:qa`. To run just this file:
//   npx playwright test -c playwright.qa.config.ts --project=broadcast-audience-contract
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./fixtures";

interface AudienceRow {
  organization_id: string;
  user_id: string;
  email: string;
  eligible: boolean;
  skip_reason: string | null;
}

/**
 * Loud-throw env lookup, matching test-credentials.ts's pattern: importing
 * this file must never throw, but actually trying to sign in with a missing
 * credential throws immediately with a fix-it message instead of the test
 * silently skipping or reporting a confusing auth failure.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set, so this test cannot authenticate.\n\n` +
        `This spec needs two real accounts:\n` +
        `  - a platform admin: PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD\n` +
        `  - an ordinary org owner who is NOT a platform admin: ` +
        `QA_ORG_OWNER_EMAIL / QA_ORG_OWNER_PASSWORD\n\n` +
        `Add them to .env.test (gitignored) or the environment. Do not ` +
        `hardcode them back into this spec — see tests/README.md and ` +
        `docs/superpowers/plans/2026-08-13-dead-test-credentials.md.`,
    );
  }
  return value;
}

const PLATFORM_ADMIN = {
  get email() {
    return required("PLATFORM_ADMIN_EMAIL");
  },
  get password() {
    return required("PLATFORM_ADMIN_PASSWORD");
  },
};
const QA_ORG_OWNER = {
  get email() {
    return required("QA_ORG_OWNER_EMAIL");
  },
  get password() {
    return required("QA_ORG_OWNER_PASSWORD");
  },
};

async function signIn(
  account: { email: string; password: string },
): Promise<SupabaseClient> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  expect(error, `sign-in failed for ${account.email}: ${error?.message}`).toBeNull();
  return supabase;
}

test.describe("broadcast_audience contract", () => {
  test("transactional audience is every org owner", async () => {
    const supabase = await signIn(PLATFORM_ADMIN);

    const { data, error } = await supabase.rpc("broadcast_audience", {
      p_message_class: "transactional",
    });
    expect(error).toBeNull();

    // The oracle CANNOT be a direct read of `organizations`. Its only SELECT
    // policy is `owner_id = auth.uid() OR is_org_member(id)` — there is no
    // platform-admin bypass. Verified against pg_policies 2026-08-16: a
    // client-side count as the platform admin returns 1, their own org, while
    // the real total that day was 97. Asserting audience === that count fails
    // permanently and proves nothing. This RLS ceiling is the entire reason
    // broadcast_audience is SECURITY DEFINER.
    //
    // platform-analytics is service-role backed and platform-admin gated, and
    // is where the app's own dashboard reads this number
    // (src/pages/admin/PlatformAnalyticsPage.tsx).
    const { data: analytics, error: analyticsError } =
      await supabase.functions.invoke("platform-analytics");
    expect(analyticsError).toBeNull();

    const orgCount = analytics?.organizations?.total;
    // Guard the oracle itself. If it came back undefined or 0 — a failed
    // invoke, a changed response shape — then `toBe(orgCount)` below would
    // either throw confusingly or pass vacuously against an empty audience.
    expect(typeof orgCount).toBe("number");
    expect(orgCount).toBeGreaterThan(0);

    expect(data!.length).toBe(orgCount);
    expect(data!.every((r: AudienceRow) => r.eligible)).toBe(true);

    const emails = data!.map((r: AudienceRow) => r.email);
    expect(new Set(emails).size).toBe(emails.length); // no duplicate recipients
  });

  test("marketing audience marks opted-out owners skipped rather than dropping them", async () => {
    const supabase = await signIn(PLATFORM_ADMIN);

    const { data: tx } = await supabase.rpc("broadcast_audience", {
      p_message_class: "transactional",
    });
    const { data: mk } = await supabase.rpc("broadcast_audience", {
      p_message_class: "marketing",
    });

    // Same row count — "who didn't get it" must remain answerable. An
    // opted-out owner still appears, marked ineligible, rather than
    // vanishing from the result set the way a dropped-row bug would.
    expect(mk!.length).toBe(tx!.length);

    const skipped = mk!.filter((r: AudienceRow) => !r.eligible);
    expect(skipped.length).toBeGreaterThan(0);
    for (const s of skipped) {
      expect(["unsubscribed", "suppressed"]).toContain(s.skip_reason);
    }
  });

  test("a non-platform-admin gets no audience at all", async () => {
    const supabase = await signIn(QA_ORG_OWNER);

    // SECURITY DEFINER means this executes even though the caller fails the
    // internal is_platform_admin() gate — no permissions error surfaces.
    // The guard is only provable by the row set: it must be empty, not the
    // real audience and not an error.
    const { data, error } = await supabase.rpc("broadcast_audience", {
      p_message_class: "transactional",
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
