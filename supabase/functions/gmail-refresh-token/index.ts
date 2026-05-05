import { refreshGmailAccessToken } from "../_shared/gmail-refresh.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { organization_id } = await req.json();
    if (!organization_id) {
      return json({ success: false, error: "organization_id required" }, 400);
    }
    const result = await refreshGmailAccessToken(organization_id);
    return json(result, result.success ? 200 : 400);
  } catch (e) {
    console.error("[gmail-refresh-token]", e);
    return json({ success: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
