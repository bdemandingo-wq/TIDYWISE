import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/gmail-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { organization_id } = await req.json();
    if (!organization_id) return json({ error: "organization_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: membership } = await admin
      .from("org_memberships")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Admin role required" }, 403);
    }

    const { data: conn } = await admin
      .from("org_gmail_connections")
      .select("refresh_token_encrypted")
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (conn?.refresh_token_encrypted) {
      try {
        const refreshToken = await decryptToken(conn.refresh_token_encrypted);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch (e) {
        console.error("[gmail-disconnect] revoke failed (continuing)", e);
      }
    }

    await admin
      .from("org_gmail_connections")
      .update({ status: "revoked" })
      .eq("organization_id", organization_id);

    return json({ success: true });
  } catch (e) {
    console.error("[gmail-disconnect]", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
