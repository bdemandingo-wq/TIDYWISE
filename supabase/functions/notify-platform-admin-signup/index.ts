import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform admin phone number
const PLATFORM_ADMIN_PHONE = "+18137356859";

interface NotifySignupRequest {
  email: string;
  fullName?: string;
  phone?: string;
  signupMethod?: string; // 'email' | 'google'
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openphoneApiKey = Deno.env.get("OPENPHONE_API_KEY");
    const openphonePhoneNumberId = Deno.env.get("OPENPHONE_PHONE_NUMBER_ID");

    if (!openphoneApiKey || !openphonePhoneNumberId) {
      console.log("[notify-platform-admin-signup] OpenPhone not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Platform SMS not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, fullName, phone, signupMethod } = await req.json() as NotifySignupRequest;

    if (!email) {
      console.error("[notify-platform-admin-signup] Missing email");
      return new Response(
        JSON.stringify({ success: false, error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract phone number ID if a full URL was provided
    let extractedPhoneNumberId = openphonePhoneNumberId;
    if (openphonePhoneNumberId.includes('openphone.com')) {
      const match = openphonePhoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) {
        extractedPhoneNumberId = match[1];
      }
    }

    // Construct notification message
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true 
    });

    const message = `🚀 NEW SIGNUP!\n\n` +
      `Name: ${fullName || 'Not provided'}\n` +
      `Email: ${email}\n` +
      `Phone: ${phone || 'Not provided'}\n` +
      `Method: ${signupMethod || 'Email'}\n` +
      `Time: ${timestamp}\n\n` +
      `New potential customer just signed up for TidyWise! 🎉`;

    console.log(`[notify-platform-admin-signup] Sending notification to platform admin: ${PLATFORM_ADMIN_PHONE}`);

    // Send SMS via OpenPhone API with proper Bearer token
    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": openphoneApiKey.startsWith('Bearer ') ? openphoneApiKey : `Bearer ${openphoneApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: extractedPhoneNumberId,
        to: [PLATFORM_ADMIN_PHONE],
        content: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[notify-platform-admin-signup] OpenPhone API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send SMS" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log(`[notify-platform-admin-signup] SMS sent successfully:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[notify-platform-admin-signup] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
