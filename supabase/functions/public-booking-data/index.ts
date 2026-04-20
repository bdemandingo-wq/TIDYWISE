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

    // Resolve logo_url if it uses internal storage format
    let resolvedLogoUrl = org.logo_url;
    if (resolvedLogoUrl && resolvedLogoUrl.startsWith('storage:')) {
      try {
        const parts = resolvedLogoUrl.replace('storage:', '').split(':');
        const bucket = parts[0];
        const path = parts.slice(1).join(':');
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 3600); // 1 hour
        if (!signedError && signedData?.signedUrl) {
          resolvedLogoUrl = signedData.signedUrl;
        } else {
          console.warn('[public-booking-data] Failed to sign logo URL:', signedError?.message);
          resolvedLogoUrl = null;
        }
      } catch (e) {
        console.warn('[public-booking-data] Logo URL resolution error:', e);
        resolvedLogoUrl = null;
      }
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
        .select("booking_form_theme, show_sqft_on_booking, show_bed_bath_on_booking, show_addons_on_booking, show_frequency_discount, show_pet_options, show_home_condition, form_bg_color, form_card_color, form_text_color, form_button_color, form_button_text_color, form_accent_color, combined_pricing_enabled")
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

    const displaySettings = pricingSettingsRes.data || {};

    return new Response(
      JSON.stringify({
        success: true,
        organization: { ...org, logo_url: resolvedLogoUrl },
        services: servicesRes.data ?? [],
        servicePricing: pricingRes.data ?? [],
        branding: brandRes.data ? {
          primary_color: brandRes.data.primary_color || '#3b82f6',
          accent_color: brandRes.data.accent_color || '#14b8a6',
        } : null,
        bookingFormTheme: displaySettings.booking_form_theme || 'dark',
        formColors: {
          bg: displaySettings.form_bg_color || null,
          card: displaySettings.form_card_color || null,
          text: displaySettings.form_text_color || null,
          button: displaySettings.form_button_color || null,
          buttonText: displaySettings.form_button_text_color || null,
          accent: displaySettings.form_accent_color || null,
        },
        displaySettings: {
          show_sqft_on_booking: displaySettings.show_sqft_on_booking ?? true,
          show_bed_bath_on_booking: displaySettings.show_bed_bath_on_booking ?? true,
          show_addons_on_booking: displaySettings.show_addons_on_booking ?? true,
          show_frequency_discount: displaySettings.show_frequency_discount ?? true,
          show_pet_options: displaySettings.show_pet_options ?? true,
          show_home_condition: displaySettings.show_home_condition ?? true,
        },
        combinedPricingEnabled: (displaySettings as any).combined_pricing_enabled ?? false,
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
