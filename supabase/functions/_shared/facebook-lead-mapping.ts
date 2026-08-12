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
 *   - leads.source is compared with === against 'facebook' in
 *     src/pages/admin/LeadsPage.tsx:327, so the case matters
 *
 * leads_status_check, read from pg_constraint on the live database
 * 2026-08-12, allows EIGHT values:
 *   new, contacted, qualified, follow_up, quoted, commercial, converted, lost
 * The original CREATE TABLE (20251222044239_*.sql:92) declared only five of
 * those — new, contacted, qualified, converted, lost — so the migration files
 * understate the live constraint. This is CLAUDE.md rule 4b in miniature: the
 * live schema is the authority, not the migration that appears to define it.
 * We write 'new', which is valid under both.
 *
 * There is NO unique index on (organization_id, email) — also confirmed from
 * pg_indexes on 2026-08-12, and deliberately not added: it would reject a
 * genuine repeat inquiry from a returning customer. Duplicate protection for
 * Meta's webhook retries comes from the facebook_lead_ingestions leadgen_id
 * ledger instead, which targets the actual failure mode. See
 * classifyIngestionClaim below.
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

// ---------------------------------------------------------------------------
// Historical backfill (one-off import of leads that arrived before ingestion
// was working). See docs/superpowers/plans/2026-08-12-facebook-lead-backfill.md
//
// Timestamp facts, read from the live database 2026-08-12 after adding
// leads.backfilled_at:
//   - leads.created_at is NOT NULL DEFAULT now(). The default fires ONLY when
//     the column is omitted from the insert, so a backfill MUST pass an
//     explicit value or all 29 imported leads silently stamp as today — the
//     exact wrong outcome, and invisible until someone notices every date is
//     identical.
//   - There are NO non-internal triggers on public.leads (pg_trigger returned
//     zero rows). Nothing overwrites created_at, so an explicit value survives.
//   - leads.updated_at is NOT NULL DEFAULT now() and has no trigger
//     maintaining it either.
// ---------------------------------------------------------------------------

/**
 * Assemble a historically-imported row: identical to a live one, plus a
 * truthful arrival time and the historical-import marker.
 *
 * The spread of buildLeadRow is deliberate and load-bearing. Rebuilding the
 * seven shared fields here would let the backfill path drift from the live one;
 * spreading makes "identical in shape to a live row" true by construction
 * rather than by discipline.
 *
 * `metaCreatedTime` is passed through VERBATIM. Postgres timestamptz accepts
 * Meta's "2026-07-20T14:03:00+0000" as-is, and re-parsing or reformatting a
 * timestamp is how timezone bugs get introduced.
 *
 * `backfilledAt` non-null is what marks the row historical. It is a column
 * rather than a note because `notes` is one of the seven shared fields, so a
 * marker written there would make a shared field differ — and because an admin
 * editing notes in the UI could erase it, silently re-arming the lead for
 * outbound automation.
 */
export function buildBackfillLeadRow(args: {
  fields: MappedLeadFields;
  leadgenId: string;
  organizationId: string;
  /** Meta's `created_time`, verbatim. Never re-parse it. */
  metaCreatedTime: string;
  /** When this backfill ran. Non-null is the historical marker. */
  backfilledAt: string;
}): LeadInsertRow & { created_at: string; backfilled_at: string } {
  const { fields, leadgenId, organizationId, metaCreatedTime, backfilledAt } = args;
  return {
    ...buildLeadRow({ fields, leadgenId, organizationId }),
    // Explicit, because created_at's DEFAULT now() fires whenever the column is
    // omitted — omitting it would stamp every imported lead as today.
    created_at: metaCreatedTime,
    backfilled_at: backfilledAt,
  };
}

/**
 * Read one page of GET /{page-id}/leadgen_forms.
 *
 * Tolerates a non-object body because the Graph API answers an auth failure
 * with `{ error: {...} }` and no `data` at all — the caller checks for that
 * separately and should not have to guard this call too.
 */
export function parseLeadgenFormsPage(json: unknown): {
  formIds: string[];
  next: string | null;
} {
  const body = (json ?? {}) as { data?: unknown; paging?: { next?: unknown } };
  const rows = Array.isArray(body.data) ? body.data : [];

  const formIds: string[] = [];
  for (const row of rows) {
    const id = (row as { id?: unknown })?.id;
    if (typeof id === "string" && id) formIds.push(id);
  }

  const next = typeof body.paging?.next === "string" ? body.paging.next : null;
  return { formIds, next };
}

/**
 * Read one page of GET /{form-id}/leads.
 *
 * Returns `skipped` alongside `leads` rather than quietly dropping unusable
 * entries (CLAUDE.md rule 5). The run report has to be able to say "Meta
 * returned 29, 28 usable, here is the one that wasn't" — a count that silently
 * shrinks is indistinguishable from success.
 *
 * `field_data` is handed through untouched, in exactly the shape
 * mapMetaFieldData consumes. Reshaping it here is how the backfill would start
 * producing rows unlike the live ones.
 */
export function parseLeadsPage(json: unknown): {
  leads: Array<{ leadgenId: string; createdTime: string; fieldData: MetaFieldDatum[] }>;
  skipped: Array<{ reason: string; raw: unknown }>;
  next: string | null;
} {
  const body = (json ?? {}) as { data?: unknown; paging?: { next?: unknown } };
  const rows = Array.isArray(body.data) ? body.data : [];

  const leads: Array<{ leadgenId: string; createdTime: string; fieldData: MetaFieldDatum[] }> = [];
  const skipped: Array<{ reason: string; raw: unknown }> = [];

  for (const row of rows) {
    const r = (row ?? {}) as { id?: unknown; created_time?: unknown; field_data?: unknown };

    if (typeof r.id !== "string" || !r.id) {
      skipped.push({ reason: "lead has no id", raw: row });
      continue;
    }
    // Without a real timestamp the truthful-created_at decision can't be
    // honoured, and falling back to now() would make a July lead read as
    // today — precisely what the backfill marker exists to prevent. Skip and
    // report rather than import a lie.
    if (typeof r.created_time !== "string" || !r.created_time) {
      skipped.push({ reason: `lead ${r.id} has no created_time`, raw: row });
      continue;
    }

    leads.push({
      leadgenId: r.id,
      createdTime: r.created_time,
      fieldData: Array.isArray(r.field_data) ? (r.field_data as MetaFieldDatum[]) : [],
    });
  }

  const next = typeof body.paging?.next === "string" ? body.paging.next : null;
  return { leads, skipped, next };
}
