import { supabase } from '@/lib/supabase';

/**
 * Builds a Zapier/GHL payload for a booking event that exposes BOTH the
 * structured (nested) shape AND flat aliases that Zaps commonly expect
 * (firstName, lastName, customer_phone, service_type, bedrooms, etc.).
 *
 * Flat aliases make it trivial to map fields in Zapier without diving into
 * sub-objects, while the nested versions are kept for power-users.
 */
export async function buildBookingZapierPayload(
  booking: Record<string, any>,
): Promise<Record<string, unknown>> {
  let customer: any = null;
  let service: any = null;

  if (booking.customer_id) {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone, address, city, state, zip_code')
      .eq('id', booking.customer_id)
      .maybeSingle();
    customer = data;
  }

  if (booking.service_id) {
    const { data } = await supabase
      .from('services')
      .select('id, name, description')
      .eq('id', booking.service_id)
      .maybeSingle();
    service = data;
  }

  const firstName = customer?.first_name ?? null;
  const lastName = customer?.last_name ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  return {
    // ---- Nested (canonical) ----
    id: booking.id,
    booking_id: booking.id,
    booking_number: booking.booking_number,
    status: booking.status,
    payment_status: booking.payment_status,
    scheduled_at: booking.scheduled_at,
    duration_minutes: booking.duration,
    frequency: booking.frequency,
    notes: booking.notes,
    total_amount: booking.total_amount,
    subtotal: booking.subtotal,
    customer: customer
      ? {
          id: customer.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          email: customer.email,
          phone: customer.phone,
        }
      : null,
    service: service ? { id: service.id, name: service.name, description: service.description } : null,
    property: {
      address: booking.address,
      city: booking.city,
      state: booking.state,
      zip_code: booking.zip_code,
      bedrooms: booking.bedrooms,
      bathrooms: booking.bathrooms,
      square_footage: booking.square_footage,
    },

    // ---- Flat aliases (Zapier-friendly) ----
    firstName,
    lastName,
    fullName,
    email: customer?.email ?? null,
    phone: customer?.phone ?? null,
    customer_first_name: firstName,
    customer_last_name: lastName,
    customer_name: fullName,
    customer_email: customer?.email ?? null,
    customer_phone: customer?.phone ?? null,
    service_type: service?.name ?? null,
    service_name: service?.name ?? null,
    appointment_date: booking.scheduled_at,
    address: booking.address,
    city: booking.city,
    state: booking.state,
    zip_code: booking.zip_code,
    bedrooms: booking.bedrooms,
    bathrooms: booking.bathrooms,
    square_footage: booking.square_footage,
  };
}
