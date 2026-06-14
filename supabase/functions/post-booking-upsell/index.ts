import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Send upsell SMS after a standard clean booking is confirmed
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

    const { bookingId, organizationId } = await req.json();

    if (!bookingId || !organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing bookingId or organizationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Opt-in check: only send if org has enabled the post-booking upsell SMS
    const { data: smsSettings } = await supabase
      .from('organization_sms_settings')
      .select('sms_enabled, sms_post_booking_upsell')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!smsSettings?.sms_enabled || !smsSettings?.sms_post_booking_upsell) {
      console.log('[post-booking-upsell] Skipped — upsell SMS not enabled for org', organizationId);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'upsell_disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        customer:customers(*),
        service:services(name, id)
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[post-booking-upsell] Booking not found:", bookingError);
      return new Response(
        JSON.stringify({ success: false, error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!booking.customer?.phone) {
      console.log("[post-booking-upsell] No customer phone for booking:", bookingId);
      return new Response(
        JSON.stringify({ success: false, error: "No customer phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get available add-ons that weren't already selected
    const { data: pricingData } = await supabase
      .from('service_pricing')
      .select('extras')
      .eq('organization_id', organizationId)
      .eq('service_id', booking.service?.id)
      .maybeSingle();

    const availableExtras = pricingData?.extras || [];
    const selectedExtras = booking.extras || [];
    const selectedExtraNames = selectedExtras.map((e: any) => e.name?.toLowerCase() || '');

    // Filter out already selected add-ons
    const suggestableExtras = availableExtras.filter((extra: any) => 
      !selectedExtraNames.includes(extra.name?.toLowerCase())
    ).slice(0, 3); // Max 3 suggestions

    if (suggestableExtras.length === 0) {
      console.log("[post-booking-upsell] No add-ons to suggest for booking:", bookingId);
      return new Response(
        JSON.stringify({ success: true, message: "No add-ons to suggest" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get business settings
    const { data: settings } = await supabase
      .from('business_settings')
      .select('company_name')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const companyName = settings?.company_name || 'Our Company';
    const customerName = booking.customer.first_name;

    // Build add-on suggestions text
    const addonList = suggestableExtras.map((e: any) => 
      `${e.name} (+$${e.price || 0})`
    ).join(', ');

    const message = `Hi ${customerName}! 🏠 Thanks for booking with ${companyName}! Want to make your clean even better? Add: ${addonList}. Reply with what you'd like or call us to add these services!`;

    // Send SMS
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-openphone-sms`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: booking.customer.phone,
        message,
        organizationId,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`[post-booking-upsell] Upsell SMS sent for booking ${bookingId}`);
      return new Response(
        JSON.stringify({ success: true, suggestedAddons: suggestableExtras.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error(`[post-booking-upsell] SMS failed:`, result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[post-booking-upsell] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
