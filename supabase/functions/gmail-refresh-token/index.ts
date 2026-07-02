import { refreshGmailAccessToken } from "../_shared/gmail-refresh.ts";
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
    const { organization_id } = await req.json();
    if (!organization_id || typeof organization_id !== "string") {
      return json({ success: false, error: "organization_id required" }, 400);
    }
    const access = await verifyOrgAccess(req, organization_id);
    if (!access.ok) {
      return json({ success: false, error: access.error }, access.status);
    }
    const result = await refreshGmailAccessToken(organization_id);
    return json(result, result.success ? 200 : 400);
  } catch (e) {
    console.error("[gmail-refresh-token]", e);
    return json({ success: false, error: String(e) }, 500);
  }
});
