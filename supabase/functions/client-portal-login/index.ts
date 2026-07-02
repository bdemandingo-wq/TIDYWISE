// Client portal login with per-IP + per-email rate limiting.
//
// Wraps the validate_client_portal_login RPC so we can throttle
// brute-force attempts at the edge before they hit the DB function.
// Buckets are backed by public.abuse_throttle via the shared helper.

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

// Tuneable limits — generous enough for fat-finger humans, tight
// enough to make scripted credential stuffing painful.
const IP_LIMIT = { maxPerWindow: 10, windowSeconds: 600 };       // 10 attempts / 10 min / IP
const EMAIL_LIMIT = { maxPerWindow: 5, windowSeconds: 900 };     // 5 attempts / 15 min / email
const IP_HARD_LIMIT = { maxPerWindow: 50, windowSeconds: 3600 }; // 50 attempts / hour / IP (hard cap)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ valid: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => null) as { email?: string; password?: string } | null;
    const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password || email.length > 320 || password.length > 256) {
      return json({ valid: false, error: "invalid_credentials" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const ip = getClientIp(req);

    // Hard per-IP hourly cap — checked first so a single host can't
    // rotate emails to grind through the per-email bucket.
    const hardIp = await checkAndRecord(supabase, "portal_login_ip_hard", ip, IP_HARD_LIMIT);
    if (hardIp.blocked) {
      return json({ valid: false, error: "rate_limited", retry_after: IP_HARD_LIMIT.windowSeconds }, 429);
    }

    // Short-window per-IP throttle.
    const ipBucket = await checkAndRecord(supabase, "portal_login_ip", ip, IP_LIMIT);
    if (ipBucket.blocked) {
      return json({ valid: false, error: "rate_limited", retry_after: IP_LIMIT.windowSeconds }, 429);
    }

    // Per-email throttle — blunts targeted attacks on one account
    // even when distributed across many IPs.
    const emailBucket = await checkAndRecord(supabase, "portal_login_email", email, EMAIL_LIMIT);
    if (emailBucket.blocked) {
      return json({ valid: false, error: "rate_limited", retry_after: EMAIL_LIMIT.windowSeconds }, 429);
    }

    const { data, error } = await supabase.rpc("validate_client_portal_login", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.error("[client-portal-login] rpc error:", error.message);
      return json({ valid: false, error: "invalid_credentials" }, 200);
    }

    const result = data as { valid?: boolean; reason?: string; user_id?: string } | null;
    if (!result?.valid || !result.user_id) {
      return json({ valid: false, error: "invalid_credentials" }, 200);
    }

    // Load customer_id + organization_id needed to mint a signed session token.
    const { data: portalRow, error: rowErr } = await supabase
      .from("client_portal_users")
      .select("customer_id, organization_id, is_active")
      .eq("id", result.user_id)
      .maybeSingle();

    if (rowErr || !portalRow || !portalRow.is_active) {
      return json({ valid: false, error: "invalid_credentials" }, 200);
    }

    let session_token: string | null = null;
    try {
      session_token = await mintPortalSession({
        portal_user_id: result.user_id,
        customer_id: portalRow.customer_id,
        organization_id: portalRow.organization_id,
      });
    } catch (mintErr) {
      console.error("[client-portal-login] failed to mint session:", mintErr);
      return json({ valid: false, error: "internal_error" }, 500);
    }

    return json({ valid: true, user_id: result.user_id, session_token }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[client-portal-login] unexpected:", msg);
    return json({ valid: false, error: "internal_error" }, 500);
  }
});
