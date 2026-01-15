import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

interface ExternalBookingPayload {
  // Customer info
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  
  // Address info
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  
  // Booking info
  service_name?: string;
  scheduled_at: string; // ISO date string
  duration?: number; // in minutes, default 120
  total_amount?: number;
  bedrooms?: string;
  bathrooms?: string;
  square_footage?: string;
  frequency?: string;
  notes?: string;
  extras?: Record<string, unknown>;
  
  // Organization identifier (slug or id)
  organization_slug?: string;
  organization_id?: string;
}

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

    // Parse the incoming payload
    const payload: ExternalBookingPayload = await req.json();
    console.log("[external-booking-webhook] v2 - Received payload:", JSON.stringify(payload));

    // Validate required fields
    if (!payload.first_name || !payload.last_name || !payload.email || !payload.scheduled_at) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing required fields: first_name, last_name, email, scheduled_at" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find organization by slug or id
    let organizationId = payload.organization_id;
    
    if (!organizationId && payload.organization_slug) {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', payload.organization_slug)
        .single();
      
      if (orgError || !org) {
        console.error("[external-booking-webhook] Organization not found:", orgError);
        return new Response(
          JSON.stringify({ success: false, error: "Organization not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      organizationId = org.id;
    }

    if (!organizationId) {
      // Default to TidyWise organization for external website bookings
      organizationId = 'e95b92d0-7099-408e-a773-e4407b34f8b4';
    }

    console.log("[external-booking-webhook] Using organization:", organizationId);

    // Check if customer exists, create if not
    let customerId: string;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', payload.email.toLowerCase())
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      console.log("[external-booking-webhook] Found existing customer:", customerId);
    } else {
      // Create new customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          first_name: payload.first_name,
          last_name: payload.last_name,
          email: payload.email.toLowerCase(),
          phone: payload.phone || null,
          address: payload.address || null,
          city: payload.city || null,
          state: payload.state || null,
          zip_code: payload.zip_code || null,
          organization_id: organizationId,
          customer_status: 'active',
          marketing_status: 'active',
        })
        .select('id')
        .single();

      if (customerError || !newCustomer) {
        console.error("[external-booking-webhook] Failed to create customer:", customerError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create customer" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      customerId = newCustomer.id;
      console.log("[external-booking-webhook] Created new customer:", customerId);
    }

    // Find service by name if provided
    let serviceId: string | null = null;
    if (payload.service_name) {
      const { data: service } = await supabase
        .from('services')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('name', `%${payload.service_name}%`)
        .limit(1)
        .maybeSingle();
      
      if (service) {
        serviceId = service.id;
      }
    }

    // Create the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        organization_id: organizationId,
        service_id: serviceId,
        scheduled_at: payload.scheduled_at,
        duration: payload.duration || 120,
        total_amount: payload.total_amount || 0,
        address: payload.address || null,
        city: payload.city || null,
        state: payload.state || null,
        zip_code: payload.zip_code || null,
        bedrooms: payload.bedrooms || null,
        bathrooms: payload.bathrooms || null,
        square_footage: payload.square_footage || null,
        frequency: payload.frequency || 'one-time',
        notes: payload.notes ? `[From External Website] ${payload.notes}` : '[From External Website]',
        extras: payload.extras || null,
        status: 'pending',
        payment_status: 'pending',
      })
      .select('id, booking_number')
      .single();

    if (bookingError || !booking) {
      console.error("[external-booking-webhook] Failed to create booking:", bookingError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create booking" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[external-booking-webhook] Created booking:", booking.id, "Number:", booking.booking_number);

    // Optionally send admin notification
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-admin-booking-notification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: booking.id,
          organizationId,
        }),
      });
    } catch (notifyError) {
      console.error("[external-booking-webhook] Failed to send admin notification:", notifyError);
      // Don't fail the webhook for notification errors
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        booking_id: booking.id,
        booking_number: booking.booking_number,
        customer_id: customerId,
        message: "Booking created successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[external-booking-webhook] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
