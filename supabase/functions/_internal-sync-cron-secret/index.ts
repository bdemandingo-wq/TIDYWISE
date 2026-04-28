// One-time helper: copies the CRON_SECRET env var into vault under name 'cron_secret'.
// Idempotent. Requires service role. Restricted to be invoked manually only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: "CRON_SECRET env not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Update existing 'cron_secret' vault entry, or create it.
  const { data: existing } = await supabase
    .schema("vault" as any)
    .from("secrets" as any)
    .select("id")
    .eq("name", "cron_secret")
    .maybeSingle();

  let result;
  if (existing?.id) {
    const { data, error } = await supabase.rpc("vault_update_cron_secret" as any, {
      p_value: cronSecret,
    });
    result = { mode: "update", data, error };
  } else {
    const { data, error } = await supabase.rpc("vault_create_cron_secret" as any, {
      p_value: cronSecret,
    });
    result = { mode: "create", data, error };
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
