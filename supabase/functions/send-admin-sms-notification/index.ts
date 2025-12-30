import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminNotificationRequest {
  customerName: string;
  serviceName: string;
  scheduledAt: string;
  formattedDate?: string; // Pre-formatted date from client
  formattedTime?: string; // Pre-formatted time from client
  totalAmount: number;
  address?: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[send-admin-sms-notification] Missing Supabase configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      customerName, 
      serviceName, 
      scheduledAt, 
      formattedDate: preFormattedDate,
      formattedTime: preFormattedTime,
      totalAmount,
      address,
      organizationId
    }: AdminNotificationRequest = await req.json();

    if (!organizationId) {
      console.error("[send-admin-sms-notification] Missing organizationId");
      return new Response(
        JSON.stringify({ success: false, error: "Missing organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-admin-sms-notification] Processing notification for org:", organizationId);

    // Fetch SMS settings for the organization
    const { data: smsSettings, error: settingsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error("[send-admin-sms-notification] Error fetching SMS settings:", settingsError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch SMS settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings?.sms_enabled) {
      console.log("[send-admin-sms-notification] SMS disabled for organization:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "SMS notifications are disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("[send-admin-sms-notification] OpenPhone not configured for org:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "OpenPhone not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin phone and notification settings from business settings
    const { data: businessSettings, error: businessError } = await supabase
      .from('business_settings')
      .select('company_phone, company_name, notify_new_booking')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (businessError) {
      console.error("[send-admin-sms-notification] Error fetching business settings:", businessError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch business settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if new booking notifications are enabled
    if (businessSettings?.notify_new_booking === false) {
      console.log("[send-admin-sms-notification] New booking notifications disabled for org:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "New booking notifications are disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!businessSettings?.company_phone) {
      console.log("[send-admin-sms-notification] No admin phone configured for org:", organizationId);
      return new Response(
        JSON.stringify({ success: false, error: "No admin phone number configured in business settings" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use pre-formatted date/time if provided, otherwise fall back to parsing (for backwards compatibility)
    let formattedDate: string;
    let formattedTime: string;
    
    if (preFormattedDate && preFormattedTime) {
      formattedDate = preFormattedDate;
      formattedTime = preFormattedTime;
    } else {
      // Fallback: parse scheduledAt (may have timezone issues)
      const bookingDate = new Date(scheduledAt);
      formattedDate = bookingDate.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
      formattedTime = bookingDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    }

    // Build admin notification message
    const message = `🆕 NEW BOOKING!\n\n` +
      `Customer: ${customerName}\n` +
      `Service: ${serviceName}\n` +
      `Date: ${formattedDate} at ${formattedTime}\n` +
      `${address ? `Address: ${address}\n` : ''}` +
      `Total: $${totalAmount.toFixed(2)}\n\n` +
      `Log in to your dashboard to view details.`;

    // Format admin phone
    let formattedPhone = businessSettings.company_phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    // Extract phone number ID if full URL was provided
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes('openphone.com')) {
      const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) {
        phoneNumberId = match[1];
      }
    }

    console.log(`[send-admin-sms-notification] Sending admin SMS to ${formattedPhone}`);

    // Send SMS via OpenPhone API
    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": smsSettings.openphone_api_key,
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
      console.error(`[send-admin-sms-notification] OpenPhone API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: `OpenPhone API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log(`[send-admin-sms-notification] SMS sent successfully:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-admin-sms-notification] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
