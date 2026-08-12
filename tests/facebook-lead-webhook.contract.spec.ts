// Read-only contract tests against the LIVE database and the deployed
// facebook-lead-webhook function. No secrets required — anon key only.
//
// Why these exist (CLAUDE.md rules 4 and 4b): a migration file existing is not
// proof it ran, AND live state existing is not proof a migration describes it.
// Drift runs in both directions, so the only authority on the schema is the
// schema. These tests ask it directly.
//
// PostgREST probe semantics, all four measured against this project on
// 2026-08-12 — the exhaustive list matters, see the note below:
//   200                     -> table+column exist and are readable (RLS may
//                              still return [])
//   401/403 + 42501         -> exist, access revoked ("permission denied for
//                              table ...") — a PASS for existence purposes
//   400 + 42703             -> table exists, COLUMN absent
//   404 + PGRST205          -> TABLE absent ("Could not find the table ... in
//                              the schema cache")
//
// NOTE ON THE SHAPE OF THIS HELPER. The first version of this file asserted
// absence as `status === 400 && body.includes("42703")` and then asserted
// `expect(missing).toBe(false)`. That passed vacuously for a table that did
// not exist at all: a missing table answers 404/PGRST205, so `missing` was
// false and the test went green while the table was absent. Nine tests here
// passed against a database that had neither new table. Hence: probe()
// decides PRESENCE positively, from the two success shapes only, and anything
// else is absence. The "control: a table that does not exist" test below is
// what makes that failure mode impossible to reintroduce silently.
//
// Runs under the "chromium" project. Use --no-deps to skip the setup and
// logout-check projects — logout-check deliberately revokes every session for
// the shared test account, and nothing here needs a login:
//   npx playwright test -c playwright.qa.config.ts \
//     tests/facebook-lead-webhook.contract.spec.ts --project=chromium --no-deps
import { test, expect, type APIRequestContext } from "@playwright/test";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./fixtures";

const REST = `${SUPABASE_URL}/rest/v1`;
const FN = `${SUPABASE_URL}/functions/v1/facebook-lead-webhook`;
const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

interface ProbeResult {
  present: boolean;
  /** Human-readable cause when present === false. */
  absentReason: string | null;
  status: number;
  body: string;
}

/**
 * Resolve one table.column against the live schema.
 *
 * Returns present === true ONLY for the two documented success shapes, so a
 * novel error response counts as absent rather than silently passing.
 */
async function probe(
  request: APIRequestContext,
  table: string,
  column: string,
): Promise<ProbeResult> {
  const res = await request.get(`${REST}/${table}?select=${column}&limit=1`, { headers: HEADERS });
  const status = res.status();
  const body = await res.text();

  if (status === 200) {
    return { present: true, absentReason: null, status, body };
  }
  if ((status === 401 || status === 403) && body.includes("42501")) {
    return { present: true, absentReason: null, status, body };
  }
  if (status === 404 && body.includes("PGRST205")) {
    return { present: false, absentReason: `table ${table} does not exist`, status, body };
  }
  if (status === 400 && body.includes("42703")) {
    return { present: false, absentReason: `column ${table}.${column} does not exist`, status, body };
  }
  return { present: false, absentReason: `unrecognised response ${status}`, status, body };
}

test.describe("probe controls", () => {
  // These two run first and guard every assertion below them. If the probe
  // helper stops being able to detect absence, these fail loudly instead of
  // letting the existence tests pass vacuously.
  test("control: an existing table with a fake column is reported absent via 42703", async ({
    request,
  }) => {
    const r = await probe(request, "leads", "zzz_control_fake");
    expect(r.present).toBe(false);
    expect(r.absentReason).toContain("column leads.zzz_control_fake does not exist");
  });

  test("control: a table that does not exist is reported absent via PGRST205", async ({
    request,
  }) => {
    const r = await probe(request, "zzz_table_that_never_existed", "id");
    expect(r.present).toBe(false);
    expect(r.absentReason).toContain("table zzz_table_that_never_existed does not exist");
  });

  test("control: a known-good column is reported present", async ({ request }) => {
    expect((await probe(request, "leads", "name")).present).toBe(true);
  });
});

test.describe("leads: every column buildLeadRow writes must exist", () => {
  // Exactly the keys asserted in facebook-lead-mapping.unit.spec.ts
  // ("emits exactly the columns that exist on leads"). If that list and this
  // one drift apart, one of the two tests starts failing — which is the point.
  const WRITTEN = ["name", "email", "phone", "source", "status", "notes", "organization_id"];

  for (const column of WRITTEN) {
    test(`leads.${column} exists`, async ({ request }) => {
      const r = await probe(request, "leads", column);
      expect(r.present, `${r.absentReason} (${r.status} ${r.body})`).toBe(true);
    });
  }

  for (const column of ["first_name", "last_name"]) {
    test(`leads.${column} still does NOT exist — the original bug`, async ({ request }) => {
      const r = await probe(request, "leads", column);
      expect(r.present).toBe(false);
      expect(r.absentReason).toContain(`column leads.${column} does not exist`);
    });
  }
});

test.describe("facebook_page_connections exists and is locked down", () => {
  for (const column of ["page_id", "organization_id", "is_active", "page_access_token"]) {
    test(`facebook_page_connections.${column} exists`, async ({ request }) => {
      const r = await probe(request, "facebook_page_connections", column);
      expect(r.present, `${r.absentReason} — run the Task 1 migration first`).toBe(true);
    });
  }

  test("anon cannot read page_access_token", async ({ request }) => {
    const res = await request.get(
      `${REST}/facebook_page_connections?select=page_id,page_access_token`,
      { headers: HEADERS },
    );
    // 404 would mean the table is missing, which is a Task 1 failure, not a
    // pass — assert the table is there before asserting it is locked down.
    expect(res.status(), "table missing; run the Task 1 migration").not.toBe(404);
    if (res.status() === 200) {
      // If table grants somehow allow the call, RLS must still yield no rows.
      expect(await res.json()).toEqual([]);
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(401);
    }
  });
});

test.describe("facebook_lead_ingestions idempotency ledger", () => {
  for (const column of ["leadgen_id", "lead_id", "organization_id"]) {
    test(`facebook_lead_ingestions.${column} exists`, async ({ request }) => {
      const r = await probe(request, "facebook_lead_ingestions", column);
      expect(r.present, `${r.absentReason} — run the Task 6 migration first`).toBe(true);
    });
  }

  test("anon cannot read the ledger", async ({ request }) => {
    const res = await request.get(`${REST}/facebook_lead_ingestions?select=leadgen_id`, {
      headers: HEADERS,
    });
    expect(res.status(), "table missing; run the Task 6 migration").not.toBe(404);
    if (res.status() === 200) {
      expect(await res.json()).toEqual([]);
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(401);
    }
  });
});

test.describe("facebook_lead_webhook_events carries a tenant column (BLOCKER B1)", () => {
  test("organization_id exists so morning-brief can filter by tenant", async ({ request }) => {
    const r = await probe(request, "facebook_lead_webhook_events", "organization_id");
    expect(
      r.present,
      `${r.absentReason} — BLOCKER B1 not applied; morning-brief would leak ` +
        `every org's Facebook leads to every other org`,
    ).toBe(true);
  });
});

test.describe("webhook gates are live", () => {
  test("rejects a POST with no Meta signature", async ({ request }) => {
    // The signature check precedes every DB write in index.ts, so an
    // unsigned POST stores nothing. That is what keeps this test read-only.
    const res = await request.post(FN, {
      headers: { "Content-Type": "application/json" },
      data: { object: "page", entry: [] },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects a POST with a wrong signature", async ({ request }) => {
    // A real HMAC-SHA256 of this exact body under the secret "wrong_secret" —
    // correctly formed, correct length, wrong key. Proves the comparison
    // checks the digest and not merely the header's shape.
    const res = await request.post(FN, {
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256":
          "sha256=792973a35ebf034a14faf5153a36f4b91484f437f51eabb7152caf4e1e7befb1",
      },
      data: { object: "page", entry: [] },
    });
    expect(res.status()).toBe(403);
  });

  test("rejects GET verification with a wrong verify token", async ({ request }) => {
    const res = await request.get(
      `${FN}?hub.mode=subscribe&hub.verify_token=definitely-wrong&hub.challenge=42`,
    );
    expect(res.status()).toBe(403);
    // Must not echo the challenge back to an unverified caller.
    expect(await res.text()).not.toContain("42");
  });
});
