import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  organizationId: string;
  customerName: string;
  requestedDate: string;
  serviceName?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { organizationId, customerName, requestedDate, serviceName, notes } = body;

    if (!organizationId || !customerName || !requestedDate) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OpenPhone credentials from org settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fetch organization SMS settings
    const smsResponse = await fetch(
      `${supabaseUrl}/rest/v1/organization_sms_settings?organization_id=eq.${organizationId}&select=openphone_api_key,openphone_phone_number_id,is_enabled`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const smsSettings = await smsResponse.json();
    
    // Safely check if SMS settings exist and have required properties
    if (!smsSettings || smsSettings.length === 0 || !smsSettings[0]) {
      console.log("SMS settings not found for organization:", organizationId);
      return new Response(
        JSON.stringify({ success: true, message: "SMS not configured - skipping notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgSmsSettings = smsSettings[0];
    const openphone_api_key = orgSmsSettings?.openphone_api_key;
    const openphone_phone_number_id = orgSmsSettings?.openphone_phone_number_id;
    const is_enabled = orgSmsSettings?.is_enabled;

    if (!is_enabled || !openphone_api_key || !openphone_phone_number_id) {
      console.log("SMS is disabled or not fully configured for org:", organizationId);
      return new Response(
        JSON.stringify({ success: true, message: "SMS not enabled - skipping notification" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin phone number from business settings
    const bizResponse = await fetch(
      `${supabaseUrl}/rest/v1/business_settings?organization_id=eq.${organizationId}&select=company_phone,company_name`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const bizSettings = await bizResponse.json();
    
    if (!bizSettings || bizSettings.length === 0 || !bizSettings[0].company_phone) {
      console.log("No company phone found for SMS notification");
      return new Response(
        JSON.stringify({ success: false, error: "No admin phone configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminPhone = bizSettings[0].company_phone;
    const companyName = bizSettings[0].company_name || "Your Business";

    // Format the date for display
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

    // Compose the SMS message
    let message = `📋 New Booking Request!\n\nCustomer: ${customerName}\nDate: ${formattedDate} at ${formattedTime}`;
    if (serviceName) {
      message += `\nService: ${serviceName}`;
    }
    if (notes) {
      message += `\nNotes: ${notes.substring(0, 100)}${notes.length > 100 ? "..." : ""}`;
    }
    message += `\n\nReview in ${companyName} dashboard.`;

    // Extract phone number ID (handle full URLs)
    const phoneIdMatch = openphone_phone_number_id.match(/(PN[a-zA-Z0-9]+)/);
    const phoneNumberId = phoneIdMatch ? phoneIdMatch[1] : openphone_phone_number_id;

    // Send SMS via OpenPhone
    const openPhoneResponse = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openphone_api_key}`,
      },
      body: JSON.stringify({
        content: message,
        from: phoneNumberId,
        to: [adminPhone],
      }),
    });

    if (!openPhoneResponse.ok) {
      const errorText = await openPhoneResponse.text();
      console.error("OpenPhone API error:", errorText);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send SMS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("SMS notification sent successfully for booking request");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-booking-request:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});