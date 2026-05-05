// Admin-triggered payroll-period-report.
// Lets an org owner/admin manually fire the report for their org without
// waiting for the period-end day. Uses the same processor as the cron, with
// `force: true` so the period-end check is bypassed and the most recent
// completed period is reported on if today isn't a real end day.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOrgAdmin, sharedCorsHeaders } from "../_shared/requireOrgAdmin.ts";
import {
  type OrgRow,
  processOrg,
} from "../_shared/payroll-period-process.ts";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: sharedCorsHeaders });
  }

  let body: { organization_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      {
        status: 400,
        headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const organizationId = body.organization_id;
  const auth = await requireOrgAdmin(req, organizationId);
  if (auth instanceof Response) return auth;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing Supabase configuration" }),
      {
        status: 500,
        headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: orgRow, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, owner_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgErr || !orgRow) {
    return new Response(
      JSON.stringify({
        success: false,
        error: orgErr?.message ?? "Organization not found",
      }),
      {
        status: 404,
        headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const result = await processOrg(orgRow as OrgRow, supabase, { force: true });
    return new Response(
      JSON.stringify({
        success: result.success,
        skipped: result.skipped,
        error: result.error,
        recipients: result.recipients,
        period_label: result.periodLabel,
        period_start: result.periodStart,
        period_end: result.periodEnd,
        totals: result.totals,
      }),
      {
        status: result.success ? 200 : 400,
        headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin-trigger-payroll-report] Org ${organizationId} threw:`,
      errorMessage,
    );
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
