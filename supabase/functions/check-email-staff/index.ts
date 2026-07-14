// SECURITY REVIEW (2026-07-14): intentionally public/unauthenticated.
// Called from SignupPage.tsx via the pre-session client BEFORE an account
// exists, to block self-signup for emails already registered as staff
// (they must go through the staff-portal invite instead) — there is no
// JWT to require at this point in the flow. It's a boolean staff-email
// oracle, so it's rate-limited per-IP below to slow down enumeration.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkAndRecord, getClientIp } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Max 20 checks/hour per IP — generous for real signups (one check
    // each), tight enough to slow down bulk staff-email enumeration.
    const ipLimit = await checkAndRecord(supabase, "check_email_staff",
      `ip:${getClientIp(req)}`, { maxPerWindow: 20, windowSeconds: 3600 });
    if (ipLimit.blocked) {
      return new Response(JSON.stringify({ is_staff: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const normalized = email.trim().toLowerCase();
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, organization_id")
      .ilike("email", normalized)
      .limit(1)
      .maybeSingle();

    return new Response(JSON.stringify({ is_staff: !!staffRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
