import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { isServiceRoleRequest } from "../_shared/require-caller-org.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[PUSH] ${step}${details ? " — " + JSON.stringify(details) : ""}`);
};

// ── APNs JWT token (cached per invocation) ────────────────────────────────────
let cachedJwt: { token: string; exp: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp > now + 60) return cachedJwt.token;

  const keyId   = Deno.env.get("APNS_KEY_ID")!;
  const teamId  = Deno.env.get("APNS_TEAM_ID")!;
  const p8Key   = Deno.env.get("APNS_PRIVATE_KEY")!; // full PEM content

  // Build JWT header + payload
  const header  = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };

  const enc = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${enc(header)}.${enc(payload)}`;

  // Import EC private key from p8
  const pemBody = p8Key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const token = `${signingInput}.${sig64}`;
  cachedJwt = { token, exp: now + 3600 };
  return token;
}

// ── Send one APNs push ────────────────────────────────────────────────────────
async function sendApns(deviceToken: string, title: string, body: string, data?: Record<string, string>) {
  const bundleId = Deno.env.get("APNS_BUNDLE_ID") || "com.TidyWiseApp.app";
  const jwt = await getApnsJwt();

  const payload = {
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
    },
    ...data,
  };

  // Use APNS_ENV secret to switch between sandbox and production APNs.
  // "production" -> api.push.apple.com, anything else (or unset) -> sandbox.
  const apnsHost = Deno.env.get("APNS_ENV") === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";
  const url = `https://${apnsHost}/3/device/${deviceToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    log("APNs error", { status: res.status, err, deviceToken: deviceToken.slice(0, 8) + "..." });
    return false;
  }
  return true;
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const { organization_id, title, body, data, staff_id } = await req.json() as {
      organization_id: string;
      title: string;
      body: string;
      data?: Record<string, string>;
      staff_id?: string;
    };

    if (!organization_id || !title || !body) {
      return new Response(JSON.stringify({ error: "organization_id, title, body required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // SECURITY: accept service-role callers, OR an authenticated admin/owner
    // of `organization_id`. Rejects cleaner-initiated or cross-org sends,
    // preserving the anti-phishing gate while allowing admin app actions.
    if (!isServiceRoleRequest(req)) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.slice("Bearer ".length).trim();
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: membership } = await supabase
        .from("org_memberships")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("organization_id", organization_id)
        .maybeSingle();
      const role = membership?.role;
      if (!role || !["owner", "admin", "manager"].includes(role)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    log("Sending push", { organization_id, title, staff_id });

    // Resolve target device tokens.
    let targetUserId: string | null = null;
    if (staff_id) {
      const { data: staffRow, error: staffErr } = await supabase
        .from("staff")
        .select("user_id, organization_id")
        .eq("id", staff_id)
        .maybeSingle();
      if (staffErr || !staffRow) {
        return new Response(JSON.stringify({ error: "staff_id not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (staffRow.organization_id !== organization_id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!staffRow.user_id) {
        log("Staff has no user_id — no devices", { staff_id });
        return new Response(JSON.stringify({ sent: 0, message: "Staff has no linked user" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
      }
      targetUserId = staffRow.user_id;
    }

    let tokenQuery = supabase
      .from("device_push_tokens")
      .select("token, user_id")
      .eq("platform", "ios");
    if (targetUserId) {
      tokenQuery = tokenQuery.eq("user_id", targetUserId);
    } else {
      tokenQuery = tokenQuery.eq("organization_id", organization_id);
    }
    const { data: tokens, error } = await tokenQuery;

    if (error) throw error;
    if (!tokens || tokens.length === 0) {
      log("No device tokens found", { organization_id, staff_id });
      return new Response(JSON.stringify({ sent: 0, message: "No registered devices" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    log("Sending to devices", { count: tokens.length });

    const results = await Promise.allSettled(
      tokens.map((t) => sendApns(t.token, title, body, data))
    );

    const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;
    log("Push sent", { sent, total: tokens.length });

    return new Response(JSON.stringify({ sent, total: tokens.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
