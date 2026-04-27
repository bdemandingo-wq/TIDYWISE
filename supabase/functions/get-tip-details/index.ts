import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch tip with booking info
    const { data: tip, error } = await supabase
      .from('tips')
      .select(`
        id, token, status, amount, customer_name,
        bookings:booking_id(booking_number, scheduled_at, service:services(name)),
        organizations:organization_id(name)
      `)
      .eq('token', token)
      .single();

    if (error || !tip) {
      return new Response(
        JSON.stringify({ success: false, error: "Tip not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const booking = tip.bookings as any;
    const org = tip.organizations as any;
    const service = Array.isArray(booking?.service) ? booking.service[0] : booking?.service;

    // Also fetch business settings for company name (fallback)
    const { data: settings } = await supabase
      .from('business_settings')
      .select('company_name, logo_url, primary_color, meta_pixel_id, google_analytics_id')
      .eq('organization_id', (tip as any).organization_id || '')
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        tip: {
          id: tip.id,
          status: tip.status,
          amount: tip.amount,
          customerName: tip.customer_name,
          bookingNumber: booking?.booking_number,
          scheduledAt: booking?.scheduled_at,
          serviceName: service?.name,
          companyName: settings?.company_name || org?.name || 'Your Cleaning Service',
          logoUrl: settings?.logo_url,
          primaryColor: settings?.primary_color,
          metaPixelId: (settings as any)?.meta_pixel_id ?? null,
          googleAnalyticsId: (settings as any)?.google_analytics_id ?? null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[get-tip-details] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
