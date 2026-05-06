import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIDYWISE_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4";
const WEBHOOK_SECRET = "tidywise-fb-lead-2026";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth via custom header
  const providedSecret = req.headers.get("x-webhook-secret");
  if (providedSecret !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const name = (body.name || "").toString().trim();
  const email = (body.email || "").toString().trim().toLowerCase();
  const phone = (body.phone || "").toString().trim();
  const source = (body.source || "Facebook").toString().trim() || "Facebook";
  const service_interest = body.service_interest
    ? body.service_interest.toString().trim()
    : null;
  const notes = body.notes ? body.notes.toString().trim() : null;

  if (!email) {
    return new Response(
      JSON.stringify({ error: "email is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("leads")
    .insert({
      organization_id: TIDYWISE_ORG_ID,
      name: name || "Facebook Lead",
      email: email || null,
      phone: phone || null,
      source,
      status: "new",
      service_interest,
      notes,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[facebook-lead] insert error:", error);
    return new Response(
      JSON.stringify({ error: error.message, code: error.code }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.log("[facebook-lead] inserted lead:", data.id);

  return new Response(
    JSON.stringify({ success: true, id: data.id }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
