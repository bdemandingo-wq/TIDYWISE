// Pure unit tests for the one-off Facebook lead backfill.
//
// No browser, no network, no login — runs under the "unit" project:
//   npx playwright test -c playwright.qa.config.ts --project=unit
//
// These cover the three functions the backfill adds to
// supabase/functions/_shared/facebook-lead-mapping.ts. They are in a separate
// file from facebook-lead-mapping.unit.spec.ts so the 28 tests already passing
// there stay untouched.
//
// The requirement these exist to prove: a backfilled row must be identical in
// shape to a live one. That is enforced structurally — buildBackfillLeadRow
// SPREADS buildLeadRow rather than rebuilding the fields — and the first test
// below checks it field by field rather than trusting the spread.
//
// Design decisions encoded here, both deliberate:
//   1. created_at is Meta's created_time, passed through VERBATIM. These leads
//      genuinely arrived in July; a lead's age is the most important thing
//      about it. Verbatim matters because reformatting a timestamp is how
//      timezone bugs get introduced — Postgres timestamptz accepts Meta's
//      "+0000" offset format as-is.
//   2. backfilled_at is the marker. A column, not a notes convention: notes is
//      one of the seven fields buildLeadRow produces, so writing a marker into
//      it would make a SHARED field differ and break requirement 1 above.
//      Speed-to-lead automation must filter on `backfilled_at is null`.
import { test, expect } from "@playwright/test";
import {
  mapMetaFieldData,
  buildLeadRow,
  buildBackfillLeadRow,
  parseLeadgenFormsPage,
  parseLeadsPage,
} from "../supabase/functions/_shared/facebook-lead-mapping";

// Clean Collective, resolved via the public-booking-data endpoint, not assumed.
const ORG = "0ddb3567-4641-48c8-8ff7-4bf1b87681da";
// Meta's own format, as returned by the Graph API.
const META_CREATED = "2026-07-20T14:03:00+0000";
const RUN_AT = "2026-08-12T12:00:00.000Z";

test.describe("buildBackfillLeadRow", () => {
  const fields = mapMetaFieldData([
    { name: "full_name", values: ["Ada Lovelace"] },
    { name: "email", values: ["ada@example.com"] },
    { name: "phone_number", values: ["+15551234567"] },
  ]);

  test("every field shared with a live row is identical", () => {
    const live = buildLeadRow({ fields, leadgenId: "42", organizationId: ORG });
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    for (const key of Object.keys(live)) {
      expect(back[key as keyof typeof live], `field ${key} diverged`).toEqual(
        live[key as keyof typeof live],
      );
    }
  });

  test("adds exactly created_at, updated_at and backfilled_at, and nothing else", () => {
    const live = buildLeadRow({ fields, leadgenId: "42", organizationId: ORG });
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    expect(Object.keys(back).sort()).toEqual(
      [...Object.keys(live), "created_at", "updated_at", "backfilled_at"].sort(),
    );
  });

  test("updated_at equals created_at — nothing has happened to these leads since they arrived", () => {
    // leads.updated_at is NOT NULL DEFAULT now() with no trigger maintaining
    // it, so omitting it would stamp every imported lead as "updated today",
    // which is simply false. Setting it to the arrival time also means these
    // leads surface immediately in the stale-lead follow-up panel
    // (AIAnalysisCenter.tsx:228 selects on `updated_at.lt.<threeDaysAgo>`) —
    // which is the point of importing un-followed-up July enquiries, not a
    // side effect to be avoided.
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    expect(back.updated_at).toBe(META_CREATED);
    expect(back.updated_at).toBe(back.created_at);
    // And distinctly NOT the run timestamp.
    expect(back.updated_at).not.toBe(RUN_AT);
  });

  test("created_at is Meta's created_time passed through verbatim", () => {
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    // Verbatim, not re-parsed or re-formatted: no Date round-trip, no
    // timezone normalisation. Postgres timestamptz takes this as-is.
    expect(back.created_at).toBe("2026-07-20T14:03:00+0000");
  });

  test("backfilled_at is the run timestamp, and is never empty", () => {
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    // The marker's entire job. If this is ever null or "", a future
    // speed-to-lead notifier filtering on `backfilled_at is null` would treat
    // a three-week-old lead as fresh and text a real person.
    expect(back.backfilled_at).toBe(RUN_AT);
    expect(back.backfilled_at).toBeTruthy();
  });

  test("a phone-only backfilled lead still gets the .invalid placeholder email", () => {
    const phoneOnly = mapMetaFieldData([{ name: "phone_number", values: ["+15551234567"] }]);
    const back = buildBackfillLeadRow({
      fields: phoneOnly,
      leadgenId: "555",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    expect(back.email).toBe("fb-lead-555@facebook.invalid");
  });

  test("source stays lowercase 'facebook' on backfilled rows too", () => {
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: ORG,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    expect(back.source).toBe("facebook");
  });

  test("carries the supplied organization_id — no hardcoded tenant", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    const back = buildBackfillLeadRow({
      fields,
      leadgenId: "42",
      organizationId: other,
      metaCreatedTime: META_CREATED,
      backfilledAt: RUN_AT,
    });
    expect(back.organization_id).toBe(other);
  });
});

test.describe("parseLeadgenFormsPage", () => {
  test("extracts the form ids", () => {
    const r = parseLeadgenFormsPage({
      data: [
        { id: "form_1", name: "Deep Clean Enquiry" },
        { id: "form_2", name: "Move-out Clean" },
      ],
    });
    expect(r.formIds).toEqual(["form_1", "form_2"]);
  });

  test("returns paging.next when Meta sends another page", () => {
    const r = parseLeadgenFormsPage({
      data: [{ id: "form_1" }],
      paging: { next: "https://graph.facebook.com/v21.0/next-forms-page" },
    });
    expect(r.next).toBe("https://graph.facebook.com/v21.0/next-forms-page");
  });

  test("next is null on the last page", () => {
    expect(parseLeadgenFormsPage({ data: [{ id: "form_1" }] }).next).toBeNull();
    expect(parseLeadgenFormsPage({ data: [{ id: "form_1" }], paging: {} }).next).toBeNull();
  });

  test("an empty page yields no forms and no next", () => {
    const r = parseLeadgenFormsPage({ data: [] });
    expect(r.formIds).toEqual([]);
    expect(r.next).toBeNull();
  });

  test("drops a malformed entry with no id rather than throwing", () => {
    const r = parseLeadgenFormsPage({ data: [{ id: "form_1" }, { name: "no id here" }] });
    expect(r.formIds).toEqual(["form_1"]);
  });

  test("tolerates a non-object response without throwing", () => {
    expect(parseLeadgenFormsPage(null).formIds).toEqual([]);
    expect(parseLeadgenFormsPage(undefined).formIds).toEqual([]);
    expect(parseLeadgenFormsPage("an error string").formIds).toEqual([]);
  });
});

test.describe("parseLeadsPage", () => {
  const page = {
    data: [
      {
        id: "1111111111",
        created_time: "2026-07-20T14:03:00+0000",
        field_data: [
          { name: "full_name", values: ["Ada Lovelace"] },
          { name: "email", values: ["ada@example.com"] },
        ],
      },
      {
        id: "2222222222",
        created_time: "2026-07-22T09:15:00+0000",
        field_data: [{ name: "phone_number", values: ["+15559876543"] }],
      },
    ],
    paging: { next: "https://graph.facebook.com/v21.0/next-leads-page" },
  };

  test("extracts leadgenId, createdTime and fieldData for each lead", () => {
    const r = parseLeadsPage(page);
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0].leadgenId).toBe("1111111111");
    expect(r.leads[0].createdTime).toBe("2026-07-20T14:03:00+0000");
    expect(r.leads[1].leadgenId).toBe("2222222222");
  });

  test("field_data comes out in the exact shape mapMetaFieldData consumes", () => {
    // The round trip that matters: Graph response -> parse -> map -> row.
    // If parseLeadsPage reshaped field_data at all, this would break, and the
    // backfill would produce rows unlike the live ones.
    const r = parseLeadsPage(page);
    const mapped = mapMetaFieldData(r.leads[0].fieldData);
    expect(mapped.name).toBe("Ada Lovelace");
    expect(mapped.email).toBe("ada@example.com");

    const row = buildBackfillLeadRow({
      fields: mapped,
      leadgenId: r.leads[0].leadgenId,
      organizationId: ORG,
      metaCreatedTime: r.leads[0].createdTime,
      backfilledAt: RUN_AT,
    });
    expect(row.name).toBe("Ada Lovelace");
    expect(row.created_at).toBe("2026-07-20T14:03:00+0000");
  });

  test("returns paging.next when Meta sends another page", () => {
    expect(parseLeadsPage(page).next).toBe("https://graph.facebook.com/v21.0/next-leads-page");
  });

  test("next is null on the last page", () => {
    expect(parseLeadsPage({ data: page.data }).next).toBeNull();
  });

  test("an empty page yields no leads, no skips, no next", () => {
    const r = parseLeadsPage({ data: [] });
    expect(r.leads).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(r.next).toBeNull();
  });

  test("reports a lead with no id as skipped instead of dropping it silently", () => {
    // CLAUDE.md rule 5: no silent swallowing. The backfill report has to be
    // able to say "Meta returned 29 leads, 28 usable, 1 unusable and here it
    // is" — a count that quietly shrinks is indistinguishable from success.
    const r = parseLeadsPage({
      data: [{ created_time: META_CREATED, field_data: [] }],
    });
    expect(r.leads).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toContain("id");
  });

  test("reports a lead with no created_time as skipped", () => {
    // Without a real timestamp we cannot honour the truthful-created_at
    // decision, and inserting it with now() would make a July lead look like
    // it arrived today — exactly what the marker exists to prevent.
    const r = parseLeadsPage({ data: [{ id: "3333333333", field_data: [] }] });
    expect(r.leads).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toContain("created_time");
  });

  test("a missing field_data becomes an empty array, not a throw", () => {
    const r = parseLeadsPage({ data: [{ id: "4444444444", created_time: META_CREATED }] });
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0].fieldData).toEqual([]);
    // And that still produces a valid row, via the "Facebook Lead" fallback.
    expect(mapMetaFieldData(r.leads[0].fieldData).name).toBe("Facebook Lead");
  });

  test("tolerates a non-object response without throwing", () => {
    expect(parseLeadsPage(null).leads).toEqual([]);
    expect(parseLeadsPage(undefined).leads).toEqual([]);
    expect(parseLeadsPage({ error: { message: "Invalid OAuth token" } }).leads).toEqual([]);
  });
});
