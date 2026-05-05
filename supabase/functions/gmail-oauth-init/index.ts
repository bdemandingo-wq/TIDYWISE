import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signState } from "../_shared/gmail-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

    const { organization_id } = await req.json().catch(() => ({}));
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

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    if (!clientId || !redirectUri) return json({ error: "Google OAuth not configured" }, 500);

    const state = await signState({ org_id: organization_id, user_id: userData.user.id });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return json({ url });
  } catch (e) {
    console.error("[gmail-oauth-init]", e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
