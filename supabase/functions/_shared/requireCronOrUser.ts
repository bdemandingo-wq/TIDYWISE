// Shared helper: allow either a valid x-cron-secret header (scheduled cron)
// OR a valid Supabase user JWT (manual "Run Now" from the app UI).
//
//   const gate = await requireCronOrUser(req);
//   if (gate) return gate;

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export async function requireCronOrUser(req: Request): Promise<Response | null> {
  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");

  if (expected && provided && provided === expected) {
    return null;
  }

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
      // fall through
    }
  }

  return new Response(
    JSON.stringify({
      error:
        "Unauthorized: provide a valid x-cron-secret header or an authenticated user session",
    }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
