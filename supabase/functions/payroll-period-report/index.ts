// Cron-driven daily runner for the payroll-period-report email.
// Invoked once a day at 00:00 UTC (~8 PM ET) by pg_cron. The function loops
// every organization, decides whether *today* (in their timezone) is the
// closing day of their payroll period, and sends a report when it is.
//
// All real work — period math, calc, dedupe, render, send — lives in
// _shared/payroll-period-process.ts so the admin-trigger function can reuse it.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import {
  type OrgRow,
  type ProcessOrgResult,
  processOrg,
} from "../_shared/payroll-period-process.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronGate = requireCronSecret(req);
  if (cronGate) return cronGate;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: orgsData, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, owner_id");

  if (orgsErr) {
    return new Response(
      JSON.stringify({ error: orgsErr.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const orgs = (orgsData ?? []) as OrgRow[];
  const results: ProcessOrgResult[] = [];

  for (const org of orgs) {
    try {
      const r = await processOrg(org, supabase);
      results.push(r);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[payroll-period-report] Org ${org.id} threw:`,
        errorMessage,
      );
      results.push({
        organizationId: org.id,
        success: false,
        error: errorMessage,
      });
    }
  }

  const sent = results.filter((r) => r.success && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.success).length;

  return new Response(
    JSON.stringify({
      success: true,
      summary: { total: orgs.length, sent, skipped, failed },
      results: results.map((r) => ({
        organizationId: r.organizationId,
        success: r.success,
        skipped: r.skipped,
        error: r.error,
        period_end: r.periodEnd,
      })),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
