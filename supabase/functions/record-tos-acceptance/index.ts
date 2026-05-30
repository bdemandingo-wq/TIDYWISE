// Server-side ToS acceptance recording.
//
// The browser shouldn't reach out to api.ipify.org to learn its own IP
// — that leaks every signup attempt to a third party (plus their
// logging/analytics chain), and ad blockers / NordVPN Threat Protection
// block ipify so a meaningful fraction of users get a null IP on the
// resulting tos_acceptances row, which downgrades that row's value as
// dispute evidence under Visa CE 3.0.
//
// Instead the signup page calls this function right after signUp
// succeeds. The Authorization header carries the fresh session token;
// we resolve the user from it and write the row with IP / UA pulled
// from server-side request headers.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: udata } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const user = udata?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tosVersion = typeof body?.tos_version === "string"
      ? body.tos_version.slice(0, 32)
      : "2025-02-01";

    // Server-trusted IP / UA. Order matches Supabase's edge proxy chain.
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = req.headers.get("user-agent") || null;

    // Service-role client for the insert — RLS on tos_acceptances may
    // restrict to admin/service role only; using the authed user client
    // would fail under tighter policies. The user identity is taken
    // from the verified JWT above, not the body.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { error } = await admin.from("tos_acceptances").insert({
      user_id: user.id,
      email: user.email,
      ip_address: ip,
      user_agent: userAgent,
      accepted: true,
      tos_version: tosVersion,
    });

    if (error) {
      console.error("[record-tos-acceptance] insert failed:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[record-tos-acceptance] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
