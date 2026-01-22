import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  verifyAdminAuth,
  createForbiddenResponse,
  createUnauthorizedResponse,
} from "../_shared/verify-admin-auth.ts";
import { createErrorResponse, createSuccessResponse, logToSystem } from "../_shared/system-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa expects binary string
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    const auth = await verifyAdminAuth(authHeader, { requireAdmin: true });
    if (!auth.success) {
      const resp = auth.error?.includes("admin")
        ? createForbiddenResponse(auth.error ?? "Forbidden", corsHeaders)
        : createUnauthorizedResponse(auth.error ?? "Unauthorized", corsHeaders);

      await logToSystem({
        level: "warn",
        source: "create-customer-portal-invite",
        message: "Blocked invite creation attempt",
        details: { reason: auth.error },
        userId: auth.userId,
        organizationId: auth.organizationId,
        requestId,
      });
      return resp;
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.json().catch(() => ({}));
    const customerId = String(body.customerId ?? "").trim();
    if (!customerId) {
      return await createErrorResponse(
        "Missing customerId",
        400,
        corsHeaders,
        {
          source: "create-customer-portal-invite",
          userId: auth.userId,
          organizationId: auth.organizationId,
          requestId,
        }
      );
    }

    // Ensure customer belongs to the inviter's org and get email
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, email, organization_id")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError || !customer) {
      return await createErrorResponse(
        "Customer not found",
        404,
        corsHeaders,
        {
          source: "create-customer-portal-invite",
          details: { customerError: customerError?.message },
          userId: auth.userId,
          organizationId: auth.organizationId,
          requestId,
        }
      );
    }

    if (customer.organization_id !== auth.organizationId) {
      return await createErrorResponse(
        "Access denied: organization mismatch",
        403,
        corsHeaders,
        {
          source: "create-customer-portal-invite",
          userId: auth.userId,
          organizationId: auth.organizationId,
          requestId,
        }
      );
    }

    const email = (customer.email ?? "").toLowerCase().trim();
    if (!email) {
      return await createErrorResponse(
        "Customer email is missing",
        400,
        corsHeaders,
        {
          source: "create-customer-portal-invite",
          userId: auth.userId,
          organizationId: auth.organizationId,
          requestId,
        }
      );
    }

    // Token (store only hash)
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = base64UrlEncode(tokenBytes);
    const tokenHash = await sha256Hex(token);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { error: insertError } = await supabaseAdmin.from("customer_portal_invites").insert({
      organization_id: auth.organizationId,
      customer_id: customerId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by_user_id: auth.userId,
    });

    if (insertError) {
      return await createErrorResponse(
        "Failed to create invite",
        500,
        corsHeaders,
        {
          source: "create-customer-portal-invite",
          details: { insertError: insertError.message },
          userId: auth.userId,
          organizationId: auth.organizationId,
          requestId,
        }
      );
    }

    const origin = req.headers.get("origin") || "";
    const inviteUrl = `${origin}/portal/invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    await logToSystem({
      level: "info",
      source: "create-customer-portal-invite",
      message: "Customer portal invite created",
      details: { customerId, expiresAt },
      userId: auth.userId,
      organizationId: auth.organizationId,
      requestId,
    });

    return createSuccessResponse({ inviteUrl, expiresAt }, corsHeaders);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return await createErrorResponse(message, 500, corsHeaders, {
      source: "create-customer-portal-invite",
      requestId,
    });
  }
});
