import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PublicBookingDataRequest = {
  orgSlug?: string;
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[public-booking-data] Missing backend configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { orgSlug } = (await req.json().catch(() => ({}))) as PublicBookingDataRequest;

    if (!orgSlug) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing orgSlug" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[public-booking-data] Fetching public booking data for slug: ${orgSlug}`);

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, logo_url, slug")
      .eq("slug", orgSlug)
      .maybeSingle();

    if (orgError) {
      console.error("[public-booking-data] Org lookup error:", orgError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to lookup organization" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!org) {
      console.warn(`[public-booking-data] Organization not found for slug: ${orgSlug}`);
      return new Response(
        JSON.stringify({ success: false, error: "Organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [servicesRes, pricingRes, brandRes, pricingSettingsRes] = await Promise.all([
      supabase
        .from("services")
        .select("id, name, description, duration, price, is_active, image_url, created_at, updated_at, organization_id")
        .eq("organization_id", org.id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("service_pricing")
        .select("id, service_id, organization_id, minimum_price, sqft_prices, bedroom_pricing, extras, home_condition_options, pet_options, created_at, updated_at")
        .eq("organization_id", org.id),
      supabase
        .from("business_settings")
        .select("primary_color, accent_color")
        .eq("organization_id", org.id)
        .maybeSingle(),
      supabase
        .from("organization_pricing_settings")
        .select("booking_form_theme")
        .eq("organization_id", org.id)
        .maybeSingle(),
    ]);

    if (servicesRes.error) {
      console.error("[public-booking-data] Services fetch error:", servicesRes.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch services" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (pricingRes.error) {
      console.error("[public-booking-data] Pricing fetch error:", pricingRes.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch pricing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[public-booking-data] Loaded org=${org.id}, services=${servicesRes.data?.length ?? 0}, pricingRows=${pricingRes.data?.length ?? 0}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        organization: org,
        services: servicesRes.data ?? [],
        servicePricing: pricingRes.data ?? [],
        branding: brandRes.data ? {
          primary_color: brandRes.data.primary_color || '#3b82f6',
          accent_color: brandRes.data.accent_color || '#14b8a6',
        } : null,
        bookingFormTheme: pricingSettingsRes.data?.booking_form_theme || 'dark',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[public-booking-data] Unhandled error:", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
