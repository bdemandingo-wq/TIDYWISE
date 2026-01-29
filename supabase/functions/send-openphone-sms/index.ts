import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  to: string;
  message: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[send-openphone-sms] Missing Supabase configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { to, message, organizationId } = await req.json() as SMSRequest;

    if (!organizationId) {
      console.error("[send-openphone-sms] Missing organizationId");
      return new Response(
        JSON.stringify({ success: false, error: "Missing organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!to || !message) {
      console.error("[send-openphone-sms] Missing required fields: to or message");
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to and message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch SMS settings for the organization
    const { data: smsSettings, error: settingsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error("[send-openphone-sms] Error fetching SMS settings:", settingsError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch SMS settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings) {
      console.log("[send-openphone-sms] No SMS settings found for organization:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "SMS not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings.sms_enabled) {
      console.log("[send-openphone-sms] SMS disabled for organization:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "SMS notifications are disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = smsSettings.openphone_api_key;
    let phoneNumberId = smsSettings.openphone_phone_number_id;

    if (!apiKey || !phoneNumberId) {
      console.error("[send-openphone-sms] Missing OpenPhone credentials for org:", organizationId);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "OpenPhone not configured. Please add your API Key and Phone Number ID in Settings → SMS." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract phone number ID if a full URL or path was provided
    // Match patterns like: openphone.com/phone-numbers/PNxxx, my.openphone.com/inbox/PNxxx, or just PNxxx at end
    if (phoneNumberId.includes('/') || phoneNumberId.includes('openphone') || phoneNumberId.includes('.com')) {
      // Try to extract PN... pattern from anywhere in the string
      const pnMatch = phoneNumberId.match(/(PN[A-Za-z0-9]+)/);
      if (pnMatch) {
        phoneNumberId = pnMatch[1];
        console.log(`[send-openphone-sms] Extracted phone number ID: ${phoneNumberId}`);
      } else {
        // Try to extract from path like /phone-numbers/xxx or /inbox/xxx
        const pathMatch = phoneNumberId.match(/(?:phone-numbers|inbox)\/([A-Za-z0-9]+)/);
        if (pathMatch) {
          phoneNumberId = pathMatch[1];
          console.log(`[send-openphone-sms] Extracted phone number ID from path: ${phoneNumberId}`);
        }
      }
    }

    // Format phone number (ensure it starts with +1 for US numbers)
    let formattedPhone = to.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    console.log(`[send-openphone-sms] Sending SMS to ${formattedPhone} for org: ${organizationId}`);

    // OpenPhone expects the raw API key in the Authorization header
    const authHeader = apiKey.trim().replace(/^Bearer\s+/i, '');

    // Send SMS via OpenPhone API
    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: phoneNumberId,
        to: [formattedPhone],
        content: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-openphone-sms] OpenPhone API error: ${response.status} - ${errorText}`);
      
      // Handle billing/payment issues gracefully
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "SMS service requires payment. Please check your OpenPhone account billing.", 
            errorCode: "BILLING_REQUIRED" 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Handle auth issues
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Invalid OpenPhone API key. Please update your SMS settings.", 
            errorCode: "AUTH_FAILED" 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: `SMS delivery failed. Please try again later.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log(`[send-openphone-sms] SMS sent successfully:`, result);

    // Audit log: successful SMS send
    logAudit({
      action: AuditActions.SMS_GENERIC,
      organizationId,
      resourceType: 'phone',
      resourceId: formattedPhone,
      success: true,
    });

    return new Response(
      JSON.stringify({ success: true, messageId: result.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-openphone-sms] Error:", errorMessage);

    // Audit log: failed SMS send
    logAudit({
      action: AuditActions.SMS_GENERIC,
      organizationId: 'unknown',
      success: false,
      error: errorMessage,
    });

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
