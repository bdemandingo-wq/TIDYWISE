// One-shot migration endpoint: re-mints a portal session token for a legacy
// stored client-portal auth object that predates the signed-token change.
//
// Rate-limited per-IP to prevent abuse. Only succeeds if the referenced
// client_portal_users row still exists and is active. Never accepts
// arbitrary organization_id / customer_id from the client — those are
// re-read from the DB row and returned in the minted claims.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkAndRecord, getClientIp } from "../_shared/rate-limit.ts";
import { mintPortalSession } from "../_shared/portal-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const IP_LIMIT = { maxPerWindow: 30, windowSeconds: 600 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => null) as
      | { portal_user_id?: string; customer_id?: string }
      | null;
    const portalUserId = typeof body?.portal_user_id === "string" ? body.portal_user_id : "";
    const customerId = typeof body?.customer_id === "string" ? body.customer_id : "";

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(portalUserId) || !uuidRe.test(customerId)) {
      return json({ ok: false, error: "invalid_request" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const ip = getClientIp(req);
    const rl = await checkAndRecord(supabase, "portal_session_refresh_ip", ip, IP_LIMIT);
    if (rl.blocked) return json({ ok: false, error: "rate_limited" }, 429);

    const { data, error } = await supabase
      .from("client_portal_users")
      .select("id, customer_id, organization_id, is_active")
      .eq("id", portalUserId)
      .maybeSingle();

    if (error) return json({ ok: false, error: "lookup_failed" }, 500);
    if (!data || !data.is_active) return json({ ok: false, error: "inactive" }, 401);
    // Confirm the caller's stored customer_id matches the row — protects
    // against blindly minting tokens if someone guesses a portal_user_id.
    if (data.customer_id !== customerId || !data.organization_id) {
      return json({ ok: false, error: "mismatch" }, 401);
    }

    const token = await mintPortalSession({
      portal_user_id: data.id,
      customer_id: data.customer_id,
      organization_id: data.organization_id,
    });

    return json({
      ok: true,
      session_token: token,
      customer_id: data.customer_id,
      organization_id: data.organization_id,
    });
  } catch (e) {
    console.error("[portal-session-refresh] error", e);
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
