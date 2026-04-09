import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Strict input validation schema
const BookingSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform(v => v.toLowerCase()),
  phone: z.string().trim().max(20).regex(/^\+?[0-9\s\-().]{7,20}$/).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  zip_code: z.string().trim().max(20).optional().nullable(),
  service_name: z.string().trim().max(200).optional().nullable(),
  scheduled_at: z.string().datetime({ message: "scheduled_at must be a valid ISO 8601 datetime" }),
  duration: z.number().int().min(15).max(1440).optional().nullable(),
  total_amount: z.number().min(0).max(100000).optional().nullable(),
  bedrooms: z.string().trim().max(10).optional().nullable(),
  bathrooms: z.string().trim().max(10).optional().nullable(),
  square_footage: z.string().trim().max(20).optional().nullable(),
  frequency: z.string().trim().max(50).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  extras: z.record(z.unknown()).optional().nullable(),
  organization_slug: z.string().trim().min(1).max(100).optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
});

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

    // Parse and validate incoming payload with Zod
    const rawPayload = await req.json();
    console.log("[external-booking-webhook] v3 - Received payload");

    const parseResult = BookingSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      console.error("[external-booking-webhook] Validation failed:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid input",
          details: parseResult.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = parseResult.data;

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
      // SECURITY: Require organization context - do not default to any organization
      console.error("[external-booking-webhook] Missing organization context - organization_slug or organization_id required");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "organization_slug or organization_id is required for multi-tenant isolation" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      // Escape SQL LIKE wildcards to prevent pattern injection
      const safeName = payload.service_name.replace(/%/g, '\\%').replace(/_/g, '\\_');
      const { data: service } = await supabase
        .from('services')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('name', `%${safeName}%`)
        .limit(1)
        .maybeSingle();
      
      if (service) {
        serviceId = service.id;
      }
    }

    // --- Server-side availability re-check to prevent double-booking ---
    try {
      const scheduledDate = new Date(payload.scheduled_at);

      // Get org timezone
      const { data: bizSettings } = await supabase
        .from('business_settings')
        .select('timezone, booking_buffer_minutes')
        .eq('organization_id', organizationId)
        .maybeSingle();

      const orgTimezone = bizSettings?.timezone || 'America/New_York';
      const bufferMinutes = bizSettings?.booking_buffer_minutes || 0;

      // Get service duration
      let serviceDuration = 120;
      if (serviceId) {
        const { data: svcData } = await supabase
          .from('services')
          .select('duration')
          .eq('id', serviceId)
          .maybeSingle();
        if (svcData?.duration) serviceDuration = svcData.duration;
      }

      // Check for overlapping bookings with any staff
      const slotStart = scheduledDate;
      const slotEnd = new Date(scheduledDate.getTime() + serviceDuration * 60000);

      // Find bookings that overlap with this slot
      const { data: conflictingBookings } = await supabase
        .from('bookings')
        .select('id, staff_id, scheduled_at, duration')
        .eq('organization_id', organizationId)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', new Date(slotStart.getTime() - 24 * 60 * 60000).toISOString())
        .lte('scheduled_at', new Date(slotEnd.getTime() + 24 * 60 * 60000).toISOString());

      // Get all active staff
      const { data: activeStaff } = await supabase
        .from('staff')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      const staffIds = (activeStaff || []).map((s: any) => s.id);

      // Check if ANY staff is available for this slot
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotEnd.getTime();

      const busyStaff = new Set<string>();
      for (const cb of (conflictingBookings || [])) {
        const cbStart = new Date(cb.scheduled_at).getTime();
        const cbEnd = cbStart + ((cb.duration || 120) + bufferMinutes) * 60000;
        if (slotStartMs < cbEnd && slotEndMs > cbStart) {
          if (cb.staff_id) busyStaff.add(cb.staff_id);
        }
      }

      const availableStaff = staffIds.filter(id => !busyStaff.has(id));
      if (staffIds.length > 0 && availableStaff.length === 0) {
        console.log("[external-booking-webhook] Slot conflict detected, no available staff");
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "That time was just booked—pick another time.",
            conflict: true 
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (conflictErr) {
      console.error("[external-booking-webhook] Conflict check error (non-blocking):", conflictErr);
      // Non-blocking - continue with booking creation
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


    // Create a lead entry for this customer automatically
    try {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', payload.email.toLowerCase())
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!existingLead) {
        await supabase
          .from('leads')
          .insert({
            first_name: payload.first_name,
            last_name: payload.last_name,
            email: payload.email.toLowerCase(),
            phone: payload.phone || null,
            source: 'booking_form',
            status: 'new',
            notes: `Auto-created from public booking form (BK-${booking.booking_number})`,
            organization_id: organizationId,
          });
        console.log("[external-booking-webhook] Auto-created lead for customer");
      }
    } catch (leadErr) {
      console.error("[external-booking-webhook] Failed to create lead:", leadErr);
      // Non-blocking
    }

    // Send SMS notification to admin phone via OpenPhone
    try {
      const { data: smsSettings } = await supabase
        .from('organization_sms_settings')
        .select('openphone_api_key, openphone_phone_number_id')
        .eq('organization_id', organizationId)
        .maybeSingle();

      const { data: bizSettings } = await supabase
        .from('business_settings')
        .select('company_phone, company_name')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (smsSettings?.openphone_api_key && smsSettings?.openphone_phone_number_id && bizSettings?.company_phone) {
        let adminPhone = bizSettings.company_phone.replace(/\D/g, '');
        if (adminPhone.length === 10) adminPhone = '1' + adminPhone;
        if (!adminPhone.startsWith('+')) adminPhone = '+' + adminPhone;

        const bookingDate = new Date(payload.scheduled_at);
        const dateStr = bookingDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = bookingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        const smsBody = `📋 New Online Booking #BK-${booking.booking_number}\n` +
          `Customer: ${payload.first_name} ${payload.last_name}\n` +
          `Service: ${payload.service_name || 'N/A'}\n` +
          `Date: ${dateStr} at ${timeStr}\n` +
          `Address: ${payload.address || 'N/A'}\n` +
          `Total: $${payload.total_amount?.toFixed(2) || '0.00'}`;

        await fetch('https://api.openphone.com/v1/messages', {
          method: 'POST',
          headers: {
            'Authorization': smsSettings.openphone_api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: smsBody,
            to: [adminPhone],
            from: smsSettings.openphone_phone_number_id,
          }),
        });
        console.log("[external-booking-webhook] SMS notification sent to admin:", adminPhone);
      } else {
        console.log("[external-booking-webhook] SMS settings not configured, skipping SMS notification");
      }
    } catch (smsErr) {
      console.error("[external-booking-webhook] Failed to send SMS notification:", smsErr);
      // Non-blocking
    }

    // Optionally send admin email notification
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
