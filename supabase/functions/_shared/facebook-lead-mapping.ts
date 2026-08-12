/**
 * Pure mapping logic for Meta Lead Ads -> public.leads.
 *
 * Deliberately ZERO imports and no Deno globals so it is unit-testable from
 * the Playwright runner (same shape as _shared/format-address.ts). Tests:
 * tests/facebook-lead-mapping.unit.spec.ts
 *
 * Column facts this encodes, from the original CREATE TABLE
 * (20251222044239_*.sql:80-96) and re-probed against the live schema
 * 2026-08-12:
 *   - leads.name  TEXT NOT NULL   (there is NO first_name / last_name)
 *   - leads.email TEXT NOT NULL   (phone-only FB leads need a placeholder)
 *   - leads.status CHECK IN ('new','contacted','qualified','converted','lost')
 *   - leads.source is compared with === against 'facebook' in
 *     src/pages/admin/LeadsPage.tsx:327, so the case matters
 */

export const LEAD_SOURCE_FACEBOOK = "facebook";

const MAX_NAME = 200;
const MAX_EMAIL = 255;
const MAX_PHONE = 20;

export interface MetaFieldDatum {
  name?: string;
  values?: string[];
}

export interface MappedLeadFields {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface LeadInsertRow {
  name: string;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  notes: string;
  organization_id: string;
}

export function placeholderEmailFor(leadgenId: string): string {
  // .invalid is reserved by RFC 2606 — can never resolve to a real inbox, so
  // this is safe to store in a NOT NULL column that other features may email.
  return `fb-lead-${leadgenId}@facebook.invalid`;
}

/**
 * Flatten Meta's field_data array into the three values leads cares about.
 *
 * Meta sends `[{ name: "full_name", values: ["Ada Lovelace"] }, ...]`, and
 * which fields are present depends on how the advertiser built the form —
 * first/last vs full name, email vs phone vs both.
 */
export function mapMetaFieldData(
  fieldData: MetaFieldDatum[] | null | undefined,
): MappedLeadFields {
  const f: Record<string, string> = {};
  for (const item of fieldData ?? []) {
    const key = item?.name?.toLowerCase();
    const value = item?.values?.[0];
    // An empty string counts as absent, not as a value.
    if (key && value) f[key] = value;
  }

  const first = f["first_name"];
  const last = f["last_name"];
  const full = f["full_name"];

  let name = [first, last].filter(Boolean).join(" ").trim();
  if (!name) name = (full ?? "").trim();
  if (!name) name = "Facebook Lead";

  const email = f["email"] ? f["email"].toLowerCase() : null;
  const phone = f["phone_number"] ?? f["phone"] ?? null;

  return { name, email, phone };
}

/**
 * Assemble the exact row to insert into public.leads.
 *
 * Returns a single `name`; there is no first_name/last_name on the table.
 * `email` is never null — leads.email is NOT NULL, and a phone-only Facebook
 * lead is a paid lead we must not drop.
 */
export function buildLeadRow(args: {
  fields: MappedLeadFields;
  leadgenId: string;
  organizationId: string;
}): LeadInsertRow {
  const { fields, leadgenId, organizationId } = args;
  return {
    name: fields.name.slice(0, MAX_NAME),
    email: (fields.email ?? placeholderEmailFor(leadgenId)).slice(0, MAX_EMAIL),
    phone: fields.phone ? fields.phone.slice(0, MAX_PHONE) : null,
    source: LEAD_SOURCE_FACEBOOK,
    status: "new",
    notes: `Auto-captured from Facebook Lead Ad (leadgen_id: ${leadgenId})`,
    organization_id: organizationId,
  };
}

export interface PageConnectionRow {
  organization_id: string;
  page_access_token: string | null;
  is_active: boolean;
}

export type OrgResolution =
  | { ok: true; organizationId: string; pageAccessToken: string | null }
  | { ok: false; reason: string };

export type ClaimOutcome = "claimed" | "duplicate" | "failed";

/**
 * Decide which tenant a Page's leads belong to.
 *
 * `queryError` is a REQUIRED argument, and that is the whole point. The
 * original bug destructured only `data` from the Supabase call, so a hard
 * schema error (42703, from a column that never existed) was indistinguishable
 * from "this page isn't mapped" — the webhook logged neither and silently
 * dropped every lead. Making the error an input means it cannot be dropped.
 *
 * There is deliberately NO org-list parameter. The fallback this replaces
 * ("if exactly one organization exists, use it") could route a stranger's
 * leads into an unrelated tenant; making that unrepresentable is the fix.
 */
export function resolveOrgFromConnection(args: {
  pageId: string | null | undefined;
  connection: PageConnectionRow | null;
  queryError: { code?: string; message?: string } | null;
}): OrgResolution {
  const { pageId, connection, queryError } = args;

  if (queryError) {
    return {
      ok: false,
      reason:
        `facebook_page_connections lookup failed for page_id=${pageId}: ` +
        `${queryError.code ?? "unknown"} ${queryError.message ?? ""}`.trim(),
    };
  }
  if (!pageId) {
    return { ok: false, reason: "Meta payload contained no page_id" };
  }
  if (!connection) {
    return {
      ok: false,
      reason:
        `page_id=${pageId} is not mapped to an organization — ` +
        `add a facebook_page_connections row before enabling this page`,
    };
  }
  if (!connection.is_active) {
    return { ok: false, reason: `page_id=${pageId} connection is inactive` };
  }
  return {
    ok: true,
    organizationId: connection.organization_id,
    pageAccessToken: connection.page_access_token,
  };
}

/**
 * Interpret the result of inserting the facebook_lead_ingestions claim row.
 *
 * Meta retries any non-200 delivery, so the claim is what turns a retry into a
 * no-op instead of a second lead — and a duplicate lead means phoning the same
 * person twice. The email dedupe cannot cover this: phone-only leads get a
 * placeholder email synthesized per leadgen_id, so they are always distinct.
 *
 * 23505 (unique violation on the leadgen_id primary key) is the ONLY code that
 * means "already ingested". Every other error is a real failure and must not
 * be mistaken for a duplicate, or the lead is silently discarded.
 */
export function classifyIngestionClaim(
  error: { code?: string; message?: string } | null,
): ClaimOutcome {
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  return "failed";
}
