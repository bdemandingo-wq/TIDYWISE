import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BookingSchema,
  createBookingFromPayload,
} from "../_shared/create-booking-from-payload.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Best-effort audit row so a misconfigured partner integration is as visible
// as a broken public form. Never throws.
// deno-lint-ignore no-explicit-any
async function recordAuthFailure(supabase: any, args: {
  req: Request;
  organizationId: string | null;
  organizationSlug: string | null;
  reason: string;
  // deno-lint-ignore no-explicit-any
  payload: any;
}) {
  try {
    const p = args.payload ?? {};
    await supabase.from('booking_submission_failures').insert({
      organization_id: args.organizationId,
      organization_slug: args.organizationSlug,
      stage: 'auth',
      path: 'integration',
      reason: args.reason,
      client_ip: args.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? args.req.headers.get('x-real-ip') ?? null,
      origin: args.req.headers.get('origin'),
      user_agent: args.req.headers.get('user-agent'),
      first_name: typeof p.first_name === 'string' ? p.first_name : null,
      last_name: typeof p.last_name === 'string' ? p.last_name : null,
      email: typeof p.email === 'string' ? p.email.toLowerCase() : null,
      phone: typeof p.phone === 'string' ? p.phone : null,
      payload: p,
    });
  } catch (e) {
    console.error("[external-booking-webhook] Failed to record auth failure:", e);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse and validate incoming payload with Zod
    const rawPayload = await req.json();
    console.log("[external-booking-webhook] v3 - Received payload");

    const parseResult = BookingSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      console.error("[external-booking-webhook] Validation failed:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid input",
          details: parseResult.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = parseResult.data;

    // Find organization by slug or id
    let organizationId = payload.organization_id;
    
    if (!organizationId && payload.organization_slug) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', payload.organization_slug)
        .single();
      
      if (orgError || !org) {
        console.error("[external-booking-webhook] Organization not found:", orgError);
        return new Response(
          JSON.stringify({ success: false, error: "Organization not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      organizationId = org.id;
    }

    if (!organizationId) {
      // SECURITY: Require organization context - do not default to any organization
      console.error("[external-booking-webhook] Missing organization context - organization_slug or organization_id required");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "organization_slug or organization_id is required for multi-tenant isolation" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: require x-webhook-secret matching this organization's per-org secret
    const providedSecret = req.headers.get("x-webhook-secret") ?? "";
    if (!providedSecret) {
      await recordAuthFailure(supabase, {
        req,
        organizationId,
        organizationSlug: payload.organization_slug ?? null,
        reason: "Missing x-webhook-secret header",
        payload,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Missing x-webhook-secret header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: secretOk, error: secretErr } = await supabase.rpc(
      "verify_external_booking_secret",
      { _org_id: organizationId, _secret: providedSecret }
    );
    if (secretErr || !secretOk) {
      console.error("[external-booking-webhook] Invalid webhook secret for org", organizationId, secretErr);
      await recordAuthFailure(supabase, {
        req,
        organizationId,
        organizationSlug: payload.organization_slug ?? null,
        reason: "Invalid webhook secret",
        payload,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Everything below this point was moved verbatim into
    // _shared/create-booking-from-payload.ts — no logic changed.
    return await createBookingFromPayload({
      supabase,
      payload,
      organizationId,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      corsHeaders,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[external-booking-webhook] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
