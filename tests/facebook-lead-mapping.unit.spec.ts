// Pure unit tests for supabase/functions/_shared/facebook-lead-mapping.ts
//
// No browser, no network, no login — runs under the "unit" project in
// playwright.qa.config.ts:
//   npx playwright test -c playwright.qa.config.ts --project=unit
//
// These tests encode facts about public.leads verified against the live
// database and the original CREATE TABLE (20251222044239_*.sql:80-96):
//   - leads.name  TEXT NOT NULL  — there is NO first_name / last_name
//   - leads.email TEXT NOT NULL  — phone-only Facebook leads need a placeholder
//   - leads.source is compared with === against 'facebook' in
//     src/pages/admin/LeadsPage.tsx:327, so the case matters
//   - leads_status_check, read from pg_constraint on the LIVE database
//     2026-08-12, allows eight values: new, contacted, qualified, follow_up,
//     quoted, commercial, converted, lost. The CREATE TABLE migration declares
//     only five of them, so the files understate the live constraint — rule 4b
//     again. We write 'new', valid under both.
//   - there is NO unique index on (organization_id, email), confirmed from
//     pg_indexes 2026-08-12, and deliberately not added: it would reject a
//     genuine repeat inquiry from a returning customer.
//
// The two bugs these guard against, both confirmed live via PostgREST probe
// (400/42703, matched against a deliberately fake control column):
//   #1 the org lookup read business_settings.facebook_page_id (absent) and
//      discarded the error, so orgMatch was always null
//   #2 the insert wrote first_name/last_name (absent on leads)
// A third bug found while planning: leads.email is NOT NULL but the insert
// passed null for phone-only leads (23502).
import { test, expect } from "@playwright/test";
import {
  mapMetaFieldData,
  buildLeadRow,
  placeholderEmailFor,
  resolveOrgFromConnection,
  classifyIngestionClaim,
  LEAD_SOURCE_FACEBOOK,
} from "../supabase/functions/_shared/facebook-lead-mapping";

// Clean Collective. Resolved via the anon-callable public-booking-data
// endpoint (slug "clean-collective"), not assumed.
const ORG = "0ddb3567-4641-48c8-8ff7-4bf1b87681da";

test.describe("mapMetaFieldData", () => {
  test("combines first_name and last_name into a single name", () => {
    const r = mapMetaFieldData([
      { name: "first_name", values: ["Ada"] },
      { name: "last_name", values: ["Lovelace"] },
    ]);
    expect(r.name).toBe("Ada Lovelace");
  });

  test("uses full_name when first_name and last_name are absent", () => {
    expect(mapMetaFieldData([{ name: "full_name", values: ["Grace Hopper"] }]).name).toBe(
      "Grace Hopper",
    );
  });

  test("falls back to 'Facebook Lead' when no name field is present", () => {
    expect(mapMetaFieldData([{ name: "email", values: ["a@b.com"] }]).name).toBe("Facebook Lead");
  });

  test("matches Meta field names case-insensitively", () => {
    expect(mapMetaFieldData([{ name: "EMAIL", values: ["A@B.com"] }]).email).toBe("a@b.com");
  });

  test("accepts either phone_number or phone", () => {
    expect(mapMetaFieldData([{ name: "phone_number", values: ["+15551234567"] }]).phone).toBe(
      "+15551234567",
    );
    expect(mapMetaFieldData([{ name: "phone", values: ["+15559876543"] }]).phone).toBe(
      "+15559876543",
    );
  });

  test("returns null email when the form collected no email", () => {
    expect(mapMetaFieldData([{ name: "phone_number", values: ["+15551234567"] }]).email).toBeNull();
  });

  test("treats empty-string values as absent", () => {
    const r = mapMetaFieldData([
      { name: "email", values: [""] },
      { name: "full_name", values: [""] },
    ]);
    expect(r.email).toBeNull();
    expect(r.name).toBe("Facebook Lead");
  });

  test("tolerates missing field_data without throwing", () => {
    expect(mapMetaFieldData(undefined).name).toBe("Facebook Lead");
    expect(mapMetaFieldData(null).email).toBeNull();
  });
});

test.describe("buildLeadRow", () => {
  const complete = mapMetaFieldData([
    { name: "full_name", values: ["Ada Lovelace"] },
    { name: "email", values: ["ada@example.com"] },
    { name: "phone_number", values: ["+15551234567"] },
  ]);

  test("never emits first_name or last_name — leads has neither (bug #2)", () => {
    const row = buildLeadRow({ fields: complete, leadgenId: "111", organizationId: ORG });
    expect(Object.keys(row)).not.toContain("first_name");
    expect(Object.keys(row)).not.toContain("last_name");
    expect(row.name).toBe("Ada Lovelace");
  });

  test("emits exactly the columns that exist on leads", () => {
    const row = buildLeadRow({ fields: complete, leadgenId: "111", organizationId: ORG });
    expect(Object.keys(row).sort()).toEqual(
      ["email", "name", "notes", "organization_id", "phone", "source", "status"].sort(),
    );
  });

  test("writes source as lowercase 'facebook' so LeadsPage's strict filter matches", () => {
    expect(buildLeadRow({ fields: complete, leadgenId: "1", organizationId: ORG }).source).toBe(
      "facebook",
    );
    expect(LEAD_SOURCE_FACEBOOK).toBe("facebook");
  });

  test("carries the supplied organization_id — no hardcoded tenant", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    expect(
      buildLeadRow({ fields: complete, leadgenId: "1", organizationId: other }).organization_id,
    ).toBe(other);
  });

  test("sets status 'new', valid under the live 8-value leads_status_check", () => {
    expect(buildLeadRow({ fields: complete, leadgenId: "1", organizationId: ORG }).status).toBe(
      "new",
    );
  });

  test("records the leadgen_id in notes for traceability", () => {
    expect(
      buildLeadRow({ fields: complete, leadgenId: "987654321", organizationId: ORG }).notes,
    ).toContain("987654321");
  });

  test("substitutes a placeholder email when Facebook sends none (leads.email is NOT NULL)", () => {
    const phoneOnly = mapMetaFieldData([{ name: "phone_number", values: ["+15551234567"] }]);
    const row = buildLeadRow({ fields: phoneOnly, leadgenId: "555", organizationId: ORG });
    expect(row.email).toBe("fb-lead-555@facebook.invalid");
  });

  test("placeholder email uses the reserved .invalid TLD so it can never reach an inbox", () => {
    expect(placeholderEmailFor("555")).toMatch(/@facebook\.invalid$/);
  });

  test("lowercases and truncates email to the column width", () => {
    const long = "X".repeat(300) + "@Example.COM";
    const row = buildLeadRow({
      fields: mapMetaFieldData([{ name: "email", values: [long] }]),
      leadgenId: "1",
      organizationId: ORG,
    });
    expect(row.email).toBe(row.email.toLowerCase());
    expect(row.email.length).toBeLessThanOrEqual(255);
  });

  test("truncates name and phone", () => {
    const row = buildLeadRow({
      fields: mapMetaFieldData([
        { name: "full_name", values: ["N".repeat(250)] },
        { name: "phone_number", values: ["9".repeat(50)] },
      ]),
      leadgenId: "1",
      organizationId: ORG,
    });
    expect(row.name.length).toBeLessThanOrEqual(200);
    expect(row.phone!.length).toBeLessThanOrEqual(20);
  });
});

test.describe("resolveOrgFromConnection", () => {
  const active = {
    organization_id: ORG,
    page_access_token: "page-token-abc",
    is_active: true,
  };

  test("resolves the org and per-page token for an active connection", () => {
    expect(
      resolveOrgFromConnection({
        pageId: "1143280425539142",
        connection: active,
        queryError: null,
      }),
    ).toEqual({ ok: true, organizationId: ORG, pageAccessToken: "page-token-abc" });
  });

  test("REFUSES when the lookup query errored — the old code discarded this (bug #1)", () => {
    const r = resolveOrgFromConnection({
      pageId: "1143280425539142",
      connection: null,
      queryError: { code: "42703", message: "column does not exist" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("42703");
  });

  test("refuses an unmapped page rather than guessing an org", () => {
    const r = resolveOrgFromConnection({
      pageId: "999999999999999",
      connection: null,
      queryError: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("999999999999999");
  });

  test("refuses a deactivated connection", () => {
    expect(
      resolveOrgFromConnection({
        pageId: "1143280425539142",
        connection: { ...active, is_active: false },
        queryError: null,
      }).ok,
    ).toBe(false);
  });

  test("refuses when Meta sent no page_id", () => {
    expect(
      resolveOrgFromConnection({ pageId: null, connection: null, queryError: null }).ok,
    ).toBe(false);
  });

  test("reports a null token as null so the caller can fall back to the env var", () => {
    expect(
      resolveOrgFromConnection({
        pageId: "1143280425539142",
        connection: { ...active, page_access_token: null },
        queryError: null,
      }),
    ).toEqual({ ok: true, organizationId: ORG, pageAccessToken: null });
  });
});

test.describe("classifyIngestionClaim", () => {
  // Meta retries any non-200 delivery. The claim row on
  // facebook_lead_ingestions is what makes a retry a no-op instead of a
  // second lead — the existing email-only dedupe cannot help phone-only
  // leads, whose emails are synthesized and therefore always distinct.
  test("a clean insert means we own this leadgen_id", () => {
    expect(classifyIngestionClaim(null)).toBe("claimed");
  });

  test("23505 unique violation means Meta retried and we already ingested it", () => {
    expect(classifyIngestionClaim({ code: "23505" })).toBe("duplicate");
  });

  test("any other error is a real failure, not a duplicate", () => {
    expect(classifyIngestionClaim({ code: "23503" })).toBe("failed");
  });

  test("an error with no code is a failure, never silently a duplicate", () => {
    expect(classifyIngestionClaim({ message: "connection reset" })).toBe("failed");
  });
});
