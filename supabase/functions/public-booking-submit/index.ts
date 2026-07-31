import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BookingSchema,
  createBookingFromPayload,
} from "../_shared/create-booking-from-payload.ts";
import { checkAndRecord, getClientIp } from "../_shared/rate-limit.ts";

// Browser-facing sibling of external-booking-webhook.
//
// Deliberately requires NO secret: anything the page could send, a visitor can
// read and replay. Protections here suit a browser instead — rate limits by IP,
// org and email, plus a failure row for every rejection so a lost booking is
// still a contactable lead.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Stage = 'rate_limited' | 'validation' | 'conflict' | 'db_error' | 'auth' | 'unknown';

// deno-lint-ignore no-explicit-any
async function recordFailure(supabase: any, args: {
  req: Request;
  stage: Stage;
  reason: string;
  organizationId?: string | null;
  organizationSlug?: string | null;
  // deno-lint-ignore no-explicit-any
  payload: any;
}) {
  try {
    const p = args.payload ?? {};
    await supabase.from('booking_submission_failures').insert({
      organization_id: args.organizationId ?? null,
      organization_slug: args.organizationSlug
        ?? (typeof p.organization_slug === 'string' ? p.organization_slug : null),
      stage: args.stage,
      path: 'public',
      reason: args.reason,
      client_ip: getClientIp(args.req),
      // Recorded, never enforced. A hard origin allowlist would fail exactly
      // the way the secret check did: silently, on config the org can't see.
      origin: args.req.headers.get('origin'),
      user_agent: args.req.headers.get('user-agent'),
      first_name: typeof p.first_name === 'string' ? p.first_name : null,
      last_name: typeof p.last_name === 'string' ? p.last_name : null,
      email: typeof p.email === 'string' ? p.email.toLowerCase() : null,
      phone: typeof p.phone === 'string' ? p.phone : null,
      payload: p,
    });
  } catch (e) {
    console.error("[public-booking-submit] Failed to record failure row:", e);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[public-booking-submit] Missing Supabase configuration");
    return json({ success: false, error: "Server misconfigured" }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // deno-lint-ignore no-explicit-any
  let rawPayload: any = {};
  try {
    rawPayload = await req.json();
  } catch {
    await recordFailure(supabase, {
      req, stage: 'validation', reason: 'Malformed JSON body', payload: {},
    });
    return json({ success: false, error: "Invalid request body" }, 400);
  }

  console.log(
    `[public-booking-submit] received origin=${req.headers.get('origin') ?? 'none'} ua=${(req.headers.get('user-agent') ?? 'none').slice(0, 120)}`,
  );

  try {
    // 1. Resolve organisation (same resolution as external-booking-webhook)
    let organizationId: string | null =
      typeof rawPayload.organization_id === 'string' ? rawPayload.organization_id : null;
    const organizationSlug =
      typeof rawPayload.organization_slug === 'string' ? rawPayload.organization_slug : null;

    if (!organizationId && organizationSlug) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', organizationSlug)
        .maybeSingle();
      if (org?.id) organizationId = org.id;
    }

    if (!organizationId) {
      await recordFailure(supabase, {
        req,
        stage: 'validation',
        reason: 'Organization not found or missing organization_slug/organization_id',
        organizationSlug,
        payload: rawPayload,
      });
      return json({
        success: false,
        error: "organization_slug or organization_id is required",
      }, 400);
    }

    // 2. Rate limits (shared helper, backed by public.abuse_throttle)
    const emailKey = typeof rawPayload.email === 'string'
      ? rawPayload.email.trim().toLowerCase()
      : null;

    const limits: Array<{ bucket: string; key: string; maxPerWindow: number; windowSeconds: number }> = [
      { bucket: 'booking_submit_ip', key: getClientIp(req), maxPerWindow: 5, windowSeconds: 600 },
      { bucket: 'booking_submit_org', key: organizationId, maxPerWindow: 30, windowSeconds: 3600 },
    ];
    if (emailKey) {
      limits.push({ bucket: 'booking_submit_email', key: emailKey, maxPerWindow: 3, windowSeconds: 3600 });
    }

    for (const l of limits) {
      const { blocked } = await checkAndRecord(supabase, l.bucket, l.key, {
        maxPerWindow: l.maxPerWindow,
        windowSeconds: l.windowSeconds,
      });
      if (blocked) {
        console.warn(`[public-booking-submit] rate limited bucket=${l.bucket}`);
        await recordFailure(supabase, {
          req,
          stage: 'rate_limited',
          reason: `Rate limit exceeded: ${l.bucket}`,
          organizationId,
          organizationSlug,
          payload: rawPayload,
        });
        return json({
          success: false,
          error: "Too many booking attempts. Please wait a few minutes and try again.",
        }, 429);
      }
    }

    // 3. Validate required fields
    const parseResult = BookingSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      await recordFailure(supabase, {
        req,
        stage: 'validation',
        reason: JSON.stringify(fieldErrors).slice(0, 2000),
        organizationId,
        organizationSlug,
        payload: rawPayload,
      });
      return json({ success: false, error: "Invalid input", details: fieldErrors }, 400);
    }
    const payload = parseResult.data;

    if (!payload.phone) {
      await recordFailure(supabase, {
        req,
        stage: 'validation',
        reason: 'phone is required',
        organizationId,
        organizationSlug,
        payload: rawPayload,
      });
      return json({ success: false, error: "A phone number is required" }, 400);
    }

    // 5. Shared creation path — identical to the integration path
    return await createBookingFromPayload({
      supabase,
      payload,
      organizationId,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      corsHeaders,
    });
  } catch (error: unknown) {
    // 6. Anything thrown downstream is a db_error, and still leaves a lead.
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[public-booking-submit] Error:", message);
    await recordFailure(supabase, {
      req,
      stage: 'db_error',
      reason: message.slice(0, 2000),
      organizationId: typeof rawPayload.organization_id === 'string' ? rawPayload.organization_id : null,
      payload: rawPayload,
    });
    return json({ success: false, error: "Failed to create booking" }, 500);
  }
};

serve(handler);
