import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Platform admin only — require service role key as auth
    const serviceKeyHeader = req.headers.get("x-service-key");
    const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKeyHeader || serviceKeyHeader !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabase = createClient(supabaseUrl, expectedKey!, {
      auth: { persistSession: false },
    });

    // Find orgs sharing the same stripe_account_id
    const { data: dupAccounts } = await supabase.rpc("stripe_duplicate_accounts");

    // Find orgs with display name containing "tidywise"
    const { data: suspiciousNames } = await supabase
      .from("org_stripe_settings")
      .select("organization_id, stripe_account_id, stripe_display_name, stripe_user_email")
      .ilike("stripe_display_name", "%tidywise%");

    return new Response(
      JSON.stringify({
        duplicate_accounts: dupAccounts || [],
        suspicious_names: suspiciousNames || [],
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[stripe-isolation-audit] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
