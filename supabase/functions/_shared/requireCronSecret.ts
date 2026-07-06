// Shared helper: allow requests that either:
//   1. carry the correct x-cron-secret header (cron/scheduled invocations), or
//   2. carry a valid Supabase user JWT (manual "Run Now" from the app UI).
//
//   const gate = await requireCronSecret(req);
//   if (gate) return gate;

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export async function requireCronSecret(req: Request): Promise<Response | null> {
  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");

  // Path 1: valid cron secret
  if (expected && provided && provided === expected) {
    return null;
  }

  // Path 2: valid authenticated user JWT
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      const { data, error } = await supabase.auth.getClaims(token);
      if (!error && data?.claims?.sub) {
        return null;
      }
    } catch (_e) {
      // fall through to unauthorized
    }
  }

  if (!expected) {
    return new Response(
      JSON.stringify({ error: "CRON_SECRET not configured on server and no valid user session provided" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ error: "Unauthorized: provide a valid x-cron-secret header or authenticated user session" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
