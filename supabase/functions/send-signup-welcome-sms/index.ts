import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SignupWelcomeSmsRequest {
  to: string;
  fullName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use platform-level OpenPhone credentials (TidyWise's account)
    const apiKey = Deno.env.get("OPENPHONE_API_KEY");
    const phoneNumberId = Deno.env.get("OPENPHONE_PHONE_NUMBER_ID");

    if (!apiKey || !phoneNumberId) {
      console.error("[send-signup-welcome-sms] Missing platform OpenPhone credentials");
      return new Response(
        JSON.stringify({ success: false, error: "SMS service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to, fullName } = await req.json() as SignupWelcomeSmsRequest;

    if (!to) {
      console.error("[send-signup-welcome-sms] Missing phone number");
      return new Response(
        JSON.stringify({ success: false, error: "Phone number is required" }),
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

    // Extract phone number ID if a full URL was provided
    let extractedPhoneNumberId = phoneNumberId;
    if (phoneNumberId.includes('openphone.com')) {
      const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) {
        extractedPhoneNumberId = match[1];
      }
    }

    // Construct welcome message with features
    const greeting = fullName ? `Hi ${fullName}! ` : "Hi! ";
    const message = `${greeting}Welcome to TidyWise! 🎉

Your account is ready! Here's what you can do:

📅 Easy online booking & scheduling
💳 Accept payments & invoicing
👥 Manage staff & payroll
📊 Track customers & revenue
📱 Send automated reminders

Complete your setup to start managing your cleaning business like a pro. Questions? Reply to this text!`;

    console.log(`[send-signup-welcome-sms] Sending welcome SMS to ${formattedPhone}`);

    // Send SMS via OpenPhone API
    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: extractedPhoneNumberId,
        to: [formattedPhone],
        content: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-signup-welcome-sms] OpenPhone API error: ${response.status} - ${errorText}`);
      // Don't fail signup - just log the error
      return new Response(
        JSON.stringify({ success: false, error: `SMS failed but signup continues` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log(`[send-signup-welcome-sms] Welcome SMS sent successfully:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-signup-welcome-sms] Error:", errorMessage);

    // Don't fail signup - just log and return success
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
