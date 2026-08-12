// One-off importer for Facebook Lead Ads leads that arrived before live
// ingestion worked. See docs/superpowers/plans/2026-08-12-facebook-lead-backfill.md
//
// DELETE THIS FUNCTION AFTER THE RUN. It is a secret-gated writer to a live
// multi-tenant customer table; it should not outlive its one use.
//
// Safety properties, all deliberate:
//   - dryRun defaults to TRUE. Writing needs an explicit dryRun: false.
//   - In dry-run the ledger is only ever SELECTed, never claimed, so a dry run
//     leaves zero trace.
//   - Org and Graph token resolve through facebook_page_connections via the
//     tested resolveOrgFromConnection. No hardcoded organization_id.
//   - Claim-first through facebook_lead_ingestions, released on insert failure —
//     the same control flow as the live webhook, which is what makes a
//     double-insert impossible in either direction.
//   - Every lead Meta returns appears in the report as inserted, skipped or
//     failed, with a reason (CLAUDE.md rule 5). A count that silently shrinks
//     reads exactly like success.
//   - maxLeads caps the run; if it truncates, the report says so.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import {
  mapMetaFieldData,
  buildBackfillLeadRow,
  resolveOrgFromConnection,
  classifyIngestionClaim,
  parseLeadgenFormsPage,
  parseLeadsPage,
} from "../_shared/facebook-lead-mapping.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const GRAPH = "https://graph.facebook.com/v21.0";
/** Backstop against a paging loop that never terminates. */
const MAX_PAGES = 50;

type Outcome =
  | "inserted"
  | "would_insert"
  | "already_ingested"
  | "duplicate_email"
  | "insert_failed"
  | "claim_failed";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fetch a Graph page and fail loudly on an API error.
 *
 * Distinguishing "Meta returned no leads" from "the token was rejected" is the
 * whole reason this throws instead of returning an empty page: an auth failure
 * that reads as "0 leads found" would look like a clean, successful no-op.
 */
async function graphFetch(url: string): Promise<unknown> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  const err = (body as { error?: { message?: string; code?: number; type?: string } })?.error;
  if (err) {
    throw new Error(
      `Graph API error ${err.code ?? "?"} ${err.type ?? ""}: ${err.message ?? "unknown"}`.trim(),
    );
  }
  if (!res.ok) throw new Error(`Graph API HTTP ${res.status}`);
  return body;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const gate = requireCronSecret(req);
  if (gate) return gate;

  let body: { pageId?: unknown; dryRun?: unknown; maxLeads?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
  if (!pageId) return json({ error: "pageId is required" }, 400);

  // Default TRUE: writing to a live customer table must be opted into.
  const dryRun = body.dryRun === false ? false : true;
  const maxLeads =
    typeof body.maxLeads === "number" && body.maxLeads > 0 ? Math.floor(body.maxLeads) : 100;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Which tenant, and which token? Same path as the live webhook. ──
  const { data: connection, error: connError } = await supabase
    .from("facebook_page_connections")
    .select("organization_id, page_access_token, is_active")
    .eq("page_id", pageId)
    .maybeSingle();

  const resolution = resolveOrgFromConnection({ pageId, connection, queryError: connError });
  if (!resolution.ok) return json({ error: resolution.reason }, 400);
  const { organizationId, pageAccessToken } = resolution;

  const token = pageAccessToken ?? Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
  if (!token) return json({ error: `no page access token for page_id=${pageId}` }, 400);

  // One timestamp for the whole run, so a run is one identifiable batch.
  const backfilledAt = new Date().toISOString();

  const skippedByParser: Array<{ reason: string }> = [];
  const collected: Array<{ leadgenId: string; createdTime: string; fieldData: unknown[] }> = [];
  let truncated = false;
  let formsFound = 0;

  try {
    // ── 2. Every lead form on the page. ──
    const formIds: string[] = [];
    let formsUrl: string | null =
      `${GRAPH}/${encodeURIComponent(pageId)}/leadgen_forms` +
      `?limit=100&access_token=${encodeURIComponent(token)}`;
    for (let page = 0; formsUrl && page < MAX_PAGES; page++) {
      const parsed = parseLeadgenFormsPage(await graphFetch(formsUrl));
      formIds.push(...parsed.formIds);
      // paging.next already carries the access token; never log it.
      formsUrl = parsed.next;
    }
    formsFound = formIds.length;

    // ── 3. Every lead on every form, up to the cap. ──
    outer: for (const formId of formIds) {
      let leadsUrl: string | null =
        `${GRAPH}/${encodeURIComponent(formId)}/leads` +
        `?limit=100&access_token=${encodeURIComponent(token)}`;
      for (let page = 0; leadsUrl && page < MAX_PAGES; page++) {
        const parsed = parseLeadsPage(await graphFetch(leadsUrl));
        skippedByParser.push(...parsed.skipped.map((s) => ({ reason: s.reason })));
        for (const lead of parsed.leads) {
          if (collected.length >= maxLeads) {
            truncated = true;
            break outer;
          }
          collected.push(lead);
        }
        leadsUrl = parsed.next;
      }
    }
  } catch (err) {
    // Partial progress is reported rather than swallowed: knowing we read 2 of
    // 5 forms before the token expired is very different from knowing nothing.
    return json(
      {
        error: String(err instanceof Error ? err.message : err),
        stage: "graph_read",
        formsFound,
        leadsCollectedBeforeFailure: collected.length,
        skippedByParser,
      },
      502,
    );
  }

  // ── 4. Per-lead processing. ──
  const outcomes: Array<{ leadgenId: string; outcome: Outcome; reason?: string }> = [];

  for (const lead of collected) {
    const { leadgenId, createdTime, fieldData } = lead;
    const fields = mapMetaFieldData(fieldData as Parameters<typeof mapMetaFieldData>[0]);
    const row = buildBackfillLeadRow({
      fields,
      leadgenId,
      organizationId,
      metaCreatedTime: createdTime,
      backfilledAt,
    });

    // Already ingested? In dry-run this is a read; in a real run the claim
    // insert below is the authoritative check (it is atomic, this is not).
    if (dryRun) {
      const { data: prior } = await supabase
        .from("facebook_lead_ingestions")
        .select("lead_id")
        .eq("leadgen_id", leadgenId)
        .maybeSingle();
      if (prior) {
        outcomes.push({ leadgenId, outcome: "already_ingested" });
        continue;
      }
    }

    // Same email-dedupe rule as the live webhook, so the two paths cannot
    // disagree about what counts as a duplicate. Only meaningful for real
    // emails — placeholder addresses are unique per leadgen_id.
    if (fields.email) {
      const { data: existing, error: dupErr } = await supabase
        .from("leads")
        .select("id")
        .eq("email", fields.email)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (dupErr) {
        outcomes.push({ leadgenId, outcome: "insert_failed", reason: `dedupe: ${dupErr.message}` });
        continue;
      }
      if (existing) {
        outcomes.push({ leadgenId, outcome: "duplicate_email" });
        continue;
      }
    }

    if (dryRun) {
      outcomes.push({ leadgenId, outcome: "would_insert" });
      continue;
    }

    // ── Claim, then insert. Identical ordering to the live webhook. ──
    const { error: claimErr } = await supabase
      .from("facebook_lead_ingestions")
      .insert({ leadgen_id: leadgenId, organization_id: organizationId });
    const claim = classifyIngestionClaim(claimErr);

    if (claim === "failed") {
      outcomes.push({ leadgenId, outcome: "claim_failed", reason: claimErr?.message });
      continue;
    }
    if (claim === "duplicate") {
      const { data: prior } = await supabase
        .from("facebook_lead_ingestions")
        .select("lead_id")
        .eq("leadgen_id", leadgenId)
        .maybeSingle();
      if (prior?.lead_id) {
        outcomes.push({ leadgenId, outcome: "already_ingested" });
        continue;
      }
      // Claim with no lead_id: a previous attempt died between claiming and
      // inserting. That is an orphan, not a duplicate — skipping it would lose
      // the lead permanently. Fall through and retry the insert.
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("leads")
      .insert(row)
      .select("id")
      .single();

    if (insertErr) {
      // Release the claim so the lead can be retried.
      await supabase.from("facebook_lead_ingestions").delete().eq("leadgen_id", leadgenId);
      outcomes.push({ leadgenId, outcome: "insert_failed", reason: insertErr.message });
      continue;
    }

    await supabase
      .from("facebook_lead_ingestions")
      .update({ lead_id: inserted.id })
      .eq("leadgen_id", leadgenId);
    outcomes.push({ leadgenId, outcome: "inserted" });
  }

  const summary: Record<string, number> = {};
  for (const o of outcomes) summary[o.outcome] = (summary[o.outcome] ?? 0) + 1;

  return json({
    dryRun,
    pageId,
    organizationId,
    backfilledAt,
    formsFound,
    leadsFound: collected.length,
    truncated,
    maxLeads,
    skippedByParser,
    summary,
    outcomes,
  });
});
