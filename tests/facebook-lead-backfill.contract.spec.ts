// Read-only live schema contract for the one-off Facebook lead backfill.
// Anon key only, no secrets, no writes.
//
// Scope limit, stated up front: this file can verify the SCHEMA the backfill
// depends on, and nothing about the rows themselves. `leads` is RLS-protected
// and the anon key gets 401/42501 on it, so counting backfilled rows or
// checking their created_at spread is impossible from here. Those assertions
// live in the plan's Task B4 as SQL for Lovable to run. Do not "fix" that by
// putting a service-role key in this repo.
//
// Probe semantics, measured against this project (see the sibling file
// facebook-lead-webhook.contract.spec.ts for the full note on why presence is
// asserted positively):
//   200                -> exists and readable
//   401/403 + 42501    -> exists, access revoked  (still a PASS for existence)
//   400 + 42703        -> table exists, COLUMN absent
//   404 + PGRST205     -> TABLE absent
//
// Run:
//   npx playwright test -c playwright.qa.config.ts \
//     tests/facebook-lead-backfill.contract.spec.ts --project=chromium --no-deps
import { test, expect, type APIRequestContext } from "@playwright/test";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./fixtures";

const REST = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

interface ProbeResult {
  present: boolean;
  absentReason: string | null;
  status: number;
  body: string;
}

async function probe(
  request: APIRequestContext,
  table: string,
  column: string,
): Promise<ProbeResult> {
  const res = await request.get(`${REST}/${table}?select=${column}&limit=1`, { headers: HEADERS });
  const status = res.status();
  const body = await res.text();

  if (status === 200) return { present: true, absentReason: null, status, body };
  if ((status === 401 || status === 403) && body.includes("42501")) {
    return { present: true, absentReason: null, status, body };
  }
  if (status === 404 && body.includes("PGRST205")) {
    return { present: false, absentReason: `table ${table} does not exist`, status, body };
  }
  if (status === 400 && body.includes("42703")) {
    return {
      present: false,
      absentReason: `column ${table}.${column} does not exist`,
      status,
      body,
    };
  }
  return { present: false, absentReason: `unrecognised response ${status}`, status, body };
}

test.describe("probe controls", () => {
  test("control: a fake column on a real table is reported absent", async ({ request }) => {
    const r = await probe(request, "leads", "zzz_control_fake");
    expect(r.present).toBe(false);
    expect(r.absentReason).toContain("column leads.zzz_control_fake does not exist");
  });

  test("control: a table that does not exist is reported absent", async ({ request }) => {
    const r = await probe(request, "zzz_table_that_never_existed", "id");
    expect(r.present).toBe(false);
    expect(r.absentReason).toContain("table zzz_table_that_never_existed does not exist");
  });
});

test.describe("the marker column (Task B1)", () => {
  test("leads.backfilled_at exists", async ({ request }) => {
    const r = await probe(request, "leads", "backfilled_at");
    expect(
      r.present,
      `${r.absentReason} — run the Task B1 migration before the backfill. Without this ` +
        `column there is nothing distinguishing a three-week-old imported lead from one ` +
        `that just arrived, and future speed-to-lead texting would fire at all of them.`,
    ).toBe(true);
  });

  test("leads.created_at exists and is selectable", async ({ request }) => {
    // The backfill writes this explicitly rather than letting the default fire,
    // so that a July lead reads as July.
    expect((await probe(request, "leads", "created_at")).present).toBe(true);
  });
});

test.describe("schema the backfill depends on", () => {
  // The seven columns buildBackfillLeadRow shares with buildLeadRow. Kept in
  // step with the "adds exactly created_at and backfilled_at" unit test: if the
  // two lists diverge, one of them fails.
  const SHARED = ["name", "email", "phone", "source", "status", "notes", "organization_id"];

  for (const column of SHARED) {
    test(`leads.${column} exists`, async ({ request }) => {
      const r = await probe(request, "leads", column);
      expect(r.present, `${r.absentReason}`).toBe(true);
    });
  }

  test("the ledger exists — it is what stops the backfill and the live webhook colliding", async ({
    request,
  }) => {
    const r = await probe(request, "facebook_lead_ingestions", "leadgen_id");
    expect(r.present, `${r.absentReason} — Task 6 migration missing`).toBe(true);
  });

  test("the page mapping still carries a per-page token", async ({ request }) => {
    // The backfill resolves its org and its Graph token the same way the live
    // webhook does, through resolveOrgFromConnection. No hardcoded org.
    const r = await probe(request, "facebook_page_connections", "page_access_token");
    expect(r.present, `${r.absentReason}`).toBe(true);
  });

  test("anon still cannot read the ledger", async ({ request }) => {
    const res = await request.get(`${REST}/facebook_lead_ingestions?select=leadgen_id`, {
      headers: HEADERS,
    });
    expect(res.status(), "table missing").not.toBe(404);
    if (res.status() === 200) {
      expect(await res.json()).toEqual([]);
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(401);
    }
  });
});
