import { sendViaGmail } from "../_shared/gmail-send-core.ts";
import { verifyOrgAccess } from "../_shared/verify-org-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const orgId = body?.organization_id;
    if (!orgId || typeof orgId !== "string") {
      return json({ success: false, error: "organization_id required" }, 400);
    }
    const access = await verifyOrgAccess(req, orgId);
    if (!access.ok) {
      return json({ success: false, error: access.error }, access.status);
    }
    const result = await sendViaGmail(body);
    return json(result, result.success ? 200 : 400);
  } catch (e) {
    console.error("[gmail-send]", e);
    return json({ success: false, error: String(e) }, 500);
  }
});
