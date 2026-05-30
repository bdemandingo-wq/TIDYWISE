// Admin endpoint for moving a custom-work request through its
// lifecycle. Allowed status transitions only — the client can't
// arbitrarily set any value.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_STATUS = new Set([
  "approved",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
]);

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

    // Bearer-attached user client so is_platform_admin() can read auth.uid()
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: udata } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!udata?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin, error: adminErr } = await userClient.rpc(
      "is_platform_admin",
    );
    if (adminErr || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Platform admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const requestId: string | undefined = body?.request_id;
    const status: string | undefined = body?.status;
    const adminNotes: string | undefined = body?.admin_notes?.toString().slice(0, 2000);
    const declinedReason: string | undefined = body?.declined_reason?.toString().slice(0, 500);

    if (!requestId || !status || !ALLOWED_STATUS.has(status)) {
      return new Response(
        JSON.stringify({ error: "request_id + valid status required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const update: Record<string, unknown> = { status };
    if (status === "completed") update.fulfilled_at = new Date().toISOString();
    if (status === "declined" && declinedReason) update.declined_reason = declinedReason;
    if (adminNotes) update.admin_notes = adminNotes;

    const { data: updated, error: updateErr } = await admin
      .from("custom_work_requests")
      .update(update)
      .eq("id", requestId)
      .select("id, status, fulfilled_at")
      .single();
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ ok: true, request: updated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[update-custom-work-request] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
