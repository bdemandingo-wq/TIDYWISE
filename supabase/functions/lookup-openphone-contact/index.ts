import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Lookup contact name from OpenPhone API
 * Falls back to local database if OpenPhone lookup fails
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, organizationId } = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get organization-specific OpenPhone settings
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    // STRICT ISOLATION: Only use organization-specific credentials, never fallback to platform keys
    if (!smsSettings?.openphone_api_key) {
      console.log("[lookup-openphone-contact] No OpenPhone API key configured for organization:", organizationId);
      return new Response(
        JSON.stringify({ name: null, source: "no_api_key" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = smsSettings.openphone_api_key;

    // Normalize phone number for OpenPhone API
    const normalizedPhone = phone.replace(/\D/g, "");
    const phoneWithCountry = normalizedPhone.startsWith("1") 
      ? `+${normalizedPhone}` 
      : `+1${normalizedPhone}`;

    // Call OpenPhone Contacts API
    const openPhoneResponse = await fetch(
      `https://api.openphone.com/v1/contacts?phoneNumber=${encodeURIComponent(phoneWithCountry)}`,
      {
        method: "GET",
        headers: {
          "Authorization": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    if (!openPhoneResponse.ok) {
      console.error("OpenPhone API error:", openPhoneResponse.status, await openPhoneResponse.text());
      return new Response(
        JSON.stringify({ name: null, source: "api_error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openPhoneData = await openPhoneResponse.json();
    
    // Extract contact name from response
    if (openPhoneData.data && openPhoneData.data.length > 0) {
      const contact = openPhoneData.data[0];
      const firstName = contact.firstName || "";
      const lastName = contact.lastName || "";
      const name = `${firstName} ${lastName}`.trim() || contact.company || null;

      if (name) {
        return new Response(
          JSON.stringify({ name, source: "openphone" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // No contact found
    return new Response(
      JSON.stringify({ name: null, source: "not_found" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in lookup-openphone-contact:", error);
    return new Response(
      JSON.stringify({ error: errorMessage, name: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
