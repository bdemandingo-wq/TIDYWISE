// Read-only live schema contract for the speed-to-lead SMS. Anon key only.
//
// Scope limit, stated up front: PostgREST can see tables and columns. It cannot
// see triggers, and the single most important property of this feature —
// `WHEN (new.backfilled_at IS NULL)` on trg_notify_new_lead — is a trigger
// property. That assertion lives in the plan's Task S1 Step 4 as SQL for
// Lovable, and is proved empirically in Task S4 Step 3 by inserting a
// backfilled row and confirming the notifier never runs. Do not read a green
// run of this file as "the backfill guard works".
//
// Probe semantics (see tests/facebook-lead-webhook.contract.spec.ts for the
// full note on why presence is asserted positively):
//   200             -> exists, readable
//   401/403 + 42501 -> exists, access revoked (a PASS for existence)
//   400 + 42703     -> table exists, COLUMN absent
//   404 + PGRST205  -> TABLE absent
//
// Run:
//   npx playwright test -c playwright.qa.config.ts \
//     tests/speed-to-lead.contract.spec.ts --project=chromium --no-deps
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

test.describe("the send-claim table (Task S1)", () => {
  // lead_id is the PRIMARY KEY. That uniqueness IS the no-double-send
  // guarantee, and it is why automation_fire_log could not be reused: its
  // similarly-named idx_automation_fire_log_dedupe is not unique, so a
  // read-then-write check against it is racy.
  for (const column of [
    "lead_id",
    "organization_id",
    "status",
    "skip_reason",
    "claimed_at",
    "completed_at",
  ]) {
    test(`lead_notification_sends.${column} exists`, async ({ request }) => {
      const r = await probe(request, "lead_notification_sends", column);
      expect(r.present, `${r.absentReason} — run the Task S1 migration first`).toBe(true);
    });
  }

  test("anon cannot read the claim table", async ({ request }) => {
    const res = await request.get(`${REST}/lead_notification_sends?select=lead_id`, {
      headers: HEADERS,
    });
    expect(res.status(), "table missing; run the Task S1 migration").not.toBe(404);
    if (res.status() === 200) {
      expect(await res.json()).toEqual([]);
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(401);
    }
  });
});

test.describe("what the trigger's WHEN clause depends on", () => {
  test("leads.backfilled_at still exists", async ({ request }) => {
    // If this column were ever dropped, `WHEN (new.backfilled_at IS NULL)`
    // becomes invalid and the trigger stops working — either erroring on every
    // lead insert or, worse, being quietly recreated without the guard. Then
    // enabling the automation would text 29 people about July enquiries.
    const r = await probe(request, "leads", "backfilled_at");
    expect(
      r.present,
      `${r.absentReason} — the speed-to-lead trigger's backfill guard depends on this column`,
    ).toBe(true);
  });
});

test.describe("the automation row (Task S1 Step 3)", () => {
  test("organization_automations carries is_enabled", async ({ request }) => {
    // The seeded row must set is_enabled explicitly: the schema default is TRUE,
    // so a row created without it arrives switched ON — and this automation
    // texts real people.
    expect((await probe(request, "organization_automations", "is_enabled")).present).toBe(true);
  });

  test("organization_automations carries settings, where the org's copy lives", async ({
    request,
  }) => {
    expect((await probe(request, "organization_automations", "settings")).present).toBe(true);
  });
});
