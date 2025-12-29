import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  to: string;
  message: string;
  organizationId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENPHONE_API_KEY");
    const phoneNumberId = Deno.env.get("OPENPHONE_PHONE_NUMBER_ID");

    if (!apiKey || !phoneNumberId) {
      console.error("[send-openphone-sms] Missing OpenPhone configuration");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "OpenPhone not configured. Please add OPENPHONE_API_KEY and OPENPHONE_PHONE_NUMBER_ID." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, message, organizationId } = await req.json() as SMSRequest;

    if (!to || !message) {
      console.error("[send-openphone-sms] Missing required fields: to or message");
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to and message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number (ensure it starts with +1 for US numbers)
    let formattedPhone = to.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    console.log(`[send-openphone-sms] Sending SMS to ${formattedPhone} for org: ${organizationId || 'unknown'}`);

    // Send SMS via OpenPhone API
    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": apiKey,
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
      return new Response(
        JSON.stringify({ success: false, error: `OpenPhone API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log(`[send-openphone-sms] SMS sent successfully:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-openphone-sms] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
