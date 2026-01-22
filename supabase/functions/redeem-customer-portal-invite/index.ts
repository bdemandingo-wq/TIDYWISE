import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createErrorResponse, createSuccessResponse, logToSystem } from "../_shared/system-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return await createErrorResponse("Missing authorization header", 401, corsHeaders, {
        source: "redeem-customer-portal-invite",
        requestId,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) {
      return await createErrorResponse("Invalid or expired token", 401, corsHeaders, {
        source: "redeem-customer-portal-invite",
        requestId,
      });
    }

    const user = userData.user;
    const userEmail = (user.email ?? "").toLowerCase().trim();
    if (!userEmail) {
      return await createErrorResponse("User email is required", 400, corsHeaders, {
        source: "redeem-customer-portal-invite",
        userId: user.id,
        requestId,
      });
    }

    const body = await req.json().catch(() => ({}));
    const rawInviteToken = String(body.inviteToken ?? "").trim();
    if (!rawInviteToken) {
      return await createErrorResponse("Missing inviteToken", 400, corsHeaders, {
        source: "redeem-customer-portal-invite",
        userId: user.id,
        requestId,
      });
    }

    const tokenHash = await sha256Hex(rawInviteToken);

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("customer_portal_invites")
      .select("id, organization_id, customer_id, email, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (inviteError || !invite) {
      return await createErrorResponse("Invalid invite", 400, corsHeaders, {
        source: "redeem-customer-portal-invite",
        details: { inviteError: inviteError?.message },
        userId: user.id,
        requestId,
      });
    }

    if (invite.accepted_at) {
      return await createErrorResponse("Invite has already been used", 400, corsHeaders, {
        source: "redeem-customer-portal-invite",
        userId: user.id,
        organizationId: invite.organization_id,
        requestId,
      });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return await createErrorResponse("Invite has expired", 400, corsHeaders, {
        source: "redeem-customer-portal-invite",
        userId: user.id,
        organizationId: invite.organization_id,
        requestId,
      });
    }

    if ((invite.email ?? "").toLowerCase().trim() !== userEmail) {
      return await createErrorResponse(
        "Invite email does not match the signed-in user",
        403,
        corsHeaders,
        {
          source: "redeem-customer-portal-invite",
          userId: user.id,
          organizationId: invite.organization_id,
          requestId,
        }
      );
    }

    // Mark invite accepted
    const acceptedAt = new Date().toISOString();
    const { error: acceptError } = await supabaseAdmin
      .from("customer_portal_invites")
      .update({ accepted_at: acceptedAt, accepted_by_user_id: user.id })
      .eq("id", invite.id)
      .is("accepted_at", null);

    if (acceptError) {
      return await createErrorResponse("Failed to accept invite", 500, corsHeaders, {
        source: "redeem-customer-portal-invite",
        details: { acceptError: acceptError.message },
        userId: user.id,
        organizationId: invite.organization_id,
        requestId,
      });
    }

    // Link user to customer record (fail-safe: don't overwrite another user's link)
    const { data: customerRow, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, user_id")
      .eq("id", invite.customer_id)
      .eq("organization_id", invite.organization_id)
      .maybeSingle();

    if (customerError || !customerRow) {
      return await createErrorResponse("Customer record not found", 404, corsHeaders, {
        source: "redeem-customer-portal-invite",
        details: { customerError: customerError?.message },
        userId: user.id,
        organizationId: invite.organization_id,
        requestId,
      });
    }

    if (customerRow.user_id && customerRow.user_id !== user.id) {
      return await createErrorResponse(
        "Customer record is already linked to another user",
        409,
        corsHeaders,
        {
          source: "redeem-customer-portal-invite",
          userId: user.id,
          organizationId: invite.organization_id,
          requestId,
        }
      );
    }

    const { error: linkError } = await supabaseAdmin
      .from("customers")
      .update({ user_id: user.id })
      .eq("id", invite.customer_id)
      .eq("organization_id", invite.organization_id);

    if (linkError) {
      return await createErrorResponse("Failed to link customer record", 500, corsHeaders, {
        source: "redeem-customer-portal-invite",
        details: { linkError: linkError.message },
        userId: user.id,
        organizationId: invite.organization_id,
        requestId,
      });
    }

    await logToSystem({
      level: "info",
      source: "redeem-customer-portal-invite",
      message: "Customer portal invite redeemed",
      details: { inviteId: invite.id, customerId: invite.customer_id },
      userId: user.id,
      organizationId: invite.organization_id,
      requestId,
    });

    return createSuccessResponse(
      { success: true, customerId: invite.customer_id, organizationId: invite.organization_id },
      corsHeaders
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return await createErrorResponse(message, 500, corsHeaders, {
      source: "redeem-customer-portal-invite",
      requestId,
    });
  }
});
