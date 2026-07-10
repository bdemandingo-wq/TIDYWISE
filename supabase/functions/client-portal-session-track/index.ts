import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { verifyPortalSession } from "../_shared/portal-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Body = {
  action?: "create" | "update" | "end";
  session_id?: string;
  duration_seconds?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DURATION_SECONDS = 30 * 24 * 60 * 60;

function sanitizeDuration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_DURATION_SECONDS, Math.floor(value)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const session = await verifyPortalSession(req, supabase);
    if (!session.ok) return json({ error: session.error }, session.status);

    const body = await req.json().catch(() => ({})) as Body;
    const action = body.action;
    const durationSeconds = sanitizeDuration(body.duration_seconds);

    if (action === "create") {
      const { data: customer, error: customerErr } = await supabase
        .from("customers")
        .select("email")
        .eq("id", session.customer_id)
        .eq("organization_id", session.organization_id)
        .maybeSingle();

      if (customerErr) return json({ error: "customer_lookup_failed" }, 500);
      if (!customer?.email) return json({ error: "customer_not_found" }, 404);

      const { data, error } = await supabase
        .from("client_portal_sessions")
        .insert({
          client_user_id: session.portal_user_id,
          customer_email: customer.email,
          organization_id: session.organization_id,
          session_start: new Date().toISOString(),
          is_active: true,
          duration_seconds: 0,
        })
        .select("id")
        .single();

      if (error) {
        console.error("[client-portal-session-track] create failed", error.message);
        return json({ error: "session_create_failed" }, 500);
      }

      return json({ id: data.id });
    }

    if ((action === "update" || action === "end") && (!body.session_id || !UUID_RE.test(body.session_id))) {
      return json({ error: "invalid_session_id" }, 400);
    }

    if (action === "update") {
      const { error } = await supabase
        .from("client_portal_sessions")
        .update({
          duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.session_id)
        .eq("client_user_id", session.portal_user_id)
        .eq("organization_id", session.organization_id);

      if (error) {
        console.error("[client-portal-session-track] update failed", error.message);
        return json({ error: "session_update_failed" }, 500);
      }

      return json({ ok: true });
    }

    if (action === "end") {
      const { error } = await supabase
        .from("client_portal_sessions")
        .update({
          session_end: new Date().toISOString(),
          duration_seconds: durationSeconds,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.session_id)
        .eq("client_user_id", session.portal_user_id)
        .eq("organization_id", session.organization_id);

      if (error) {
        console.error("[client-portal-session-track] end failed", error.message);
        return json({ error: "session_end_failed" }, 500);
      }

      return json({ ok: true });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    console.error("[client-portal-session-track] unexpected", e instanceof Error ? e.message : String(e));
    return json({ error: "internal_error" }, 500);
  }
});