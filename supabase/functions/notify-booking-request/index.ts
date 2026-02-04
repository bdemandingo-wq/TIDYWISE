import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  organizationId: string;
  customerName: string;
  requestedDate: string;
  serviceName?: string;
  notes?: string;
}

const extractPhoneNumberId = (input: string): string => {
  const trimmed = (input || "").trim();
  const pnMatch = trimmed.match(/(PN[A-Za-z0-9]+)/);
  if (pnMatch) return pnMatch[1];
  const pathMatch = trimmed.match(/(?:phone-numbers|inbox)\/([A-Za-z0-9]+)$/);
  if (pathMatch) return pathMatch[1];
  return trimmed;
};

const formatE164US = (phone: string): string | null => {
  const raw = (phone || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
};

const sendOpenPhoneMessage = async (payload: {
  apiKey: string;
  from: string;
  to: string;
  content: string;
}): Promise<Response> => {
  const authToken = payload.apiKey.trim().replace(/^Bearer\s+/i, "");

  // OpenPhone auth varies across tokens; try raw token first, then Bearer fallback on 401.
  const doSend = (authHeader: string) =>
    fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        content: payload.content,
      }),
    });

  let resp = await doSend(authToken);
  if (resp.status === 401) {
    // Consume body before retry
    await resp.text();
    resp = await doSend(`Bearer ${authToken}`);
  }
  return resp;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("[notify-booking-request] Missing backend configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const { organizationId, customerName, requestedDate, serviceName, notes } = body;

    if (!organizationId || !customerName || !requestedDate) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: smsSettings, error: smsError } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (smsError) {
      console.error("[notify-booking-request] Failed to load SMS settings:", smsError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load SMS settings" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings || !smsSettings.sms_enabled) {
      console.log("[notify-booking-request] SMS not enabled for org:", organizationId);
      return new Response(
        JSON.stringify({ success: true, message: "SMS not enabled - skipping" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = (smsSettings.openphone_api_key || "").trim();
    const phoneNumberId = extractPhoneNumberId(smsSettings.openphone_phone_number_id || "");

    if (!apiKey || !phoneNumberId) {
      console.log("[notify-booking-request] Missing OpenPhone credentials for org:", organizationId);
      return new Response(
        JSON.stringify({ success: true, message: "SMS not configured - skipping" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: bizSettings, error: bizError } = await supabase
      .from("business_settings")
      .select("company_phone, company_name")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (bizError) {
      console.error("[notify-booking-request] Failed to load business settings:", bizError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load admin phone" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminPhone = formatE164US(bizSettings?.company_phone || "");
    if (!adminPhone) {
      console.log("[notify-booking-request] No valid admin phone configured for org:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "No admin phone configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const companyName = bizSettings?.company_name || "Your Business";

    const dateObj = new Date(requestedDate);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const formattedTime = dateObj.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    let message = `📋 New Booking Request!\n\nCustomer: ${customerName}\nDate: ${formattedDate} at ${formattedTime}`;
    if (serviceName) message += `\nService: ${serviceName}`;
    if (notes) {
      const safeNotes = notes.substring(0, 100);
      message += `\nNotes: ${safeNotes}${notes.length > 100 ? "..." : ""}`;
    }
    message += `\n\nReview in ${companyName} dashboard.`;

    const openPhoneResponse = await sendOpenPhoneMessage({
      apiKey,
      from: phoneNumberId,
      to: adminPhone,
      content: message,
    });

    if (!openPhoneResponse.ok) {
      const errorText = await openPhoneResponse.text();
      console.error("[notify-booking-request] OpenPhone API error:", errorText);

      if (openPhoneResponse.status === 401) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid OpenPhone API key. Please update your SMS settings.",
            errorCode: "AUTH_FAILED",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "Failed to send SMS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[notify-booking-request] SMS notification sent successfully");
    await openPhoneResponse.text();

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[notify-booking-request] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});