import type { ZapierEvent } from '@/lib/zapier';

export const ZAPIER_EVENT_META: { value: ZapierEvent; label: string; description: string }[] = [
  { value: 'customer.created', label: 'New customer created', description: 'Fires when a customer is added to the CRM.' },
  { value: 'booking.created', label: 'Booking created', description: 'Fires when a new booking is scheduled.' },
  { value: 'booking.completed', label: 'Booking completed', description: 'Fires when a booking is marked complete.' },
  { value: 'booking.cancelled', label: 'Booking cancelled', description: 'Fires when a booking is cancelled.' },
  { value: 'invoice.paid', label: 'Invoice paid', description: 'Fires when an invoice or checkout is paid.' },
  { value: 'lead.created', label: 'New lead', description: 'Fires when a lead is captured.' },
  { value: 'estimate.sent', label: 'Estimate sent', description: 'Fires when a quote/estimate is sent.' },
  { value: 'review.received', label: 'Review received', description: 'Fires when a customer leaves a review.' },
];

export const ZAPIER_SAMPLE_PAYLOADS: Record<ZapierEvent, Record<string, unknown>> = {
  'customer.created': {
    customer_id: 'cus_sample_123',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+15551234567',
    address: '123 Main St, Springfield, IL 62701',
    source: 'manual',
    created_at: '2026-06-29T15:00:00.000Z',
  },
  'booking.created': {
    booking_id: 'bkg_sample_123',
    customer_id: 'cus_sample_123',
    customer_name: 'Jane Doe',
    customer_email: 'jane@example.com',
    service: 'Standard Cleaning',
    scheduled_at: '2026-07-02T14:00:00.000Z',
    duration_minutes: 120,
    total_amount: 18500,
    currency: 'USD',
    status: 'scheduled',
  },
  'booking.completed': {
    booking_id: 'bkg_sample_123',
    customer_id: 'cus_sample_123',
    customer_name: 'Jane Doe',
    completed_at: '2026-07-02T16:00:00.000Z',
    total_amount: 18500,
    currency: 'USD',
  },
  'booking.cancelled': {
    booking_id: 'bkg_sample_123',
    customer_id: 'cus_sample_123',
    customer_name: 'Jane Doe',
    cancelled_at: '2026-06-30T09:00:00.000Z',
    reason: 'Customer request',
  },
  'invoice.paid': {
    invoice_id: 'inv_sample_123',
    customer_id: 'cus_sample_123',
    customer_email: 'jane@example.com',
    amount: 18500,
    currency: 'USD',
    paid_at: '2026-07-02T16:05:00.000Z',
    stripe_payment_intent: 'pi_sample_abc',
    source: 'stripe_checkout',
  },
  'lead.created': {
    lead_id: 'lead_sample_123',
    name: 'John Smith',
    email: 'john@example.com',
    phone: '+15557654321',
    source: 'website_form',
    notes: 'Wants a quote for biweekly cleaning',
    created_at: '2026-06-29T15:00:00.000Z',
  },
  'estimate.sent': {
    estimate_id: 'est_sample_123',
    customer_id: 'cus_sample_123',
    customer_email: 'jane@example.com',
    total_amount: 24500,
    currency: 'USD',
    status: 'sent',
    sent_at: '2026-06-29T15:00:00.000Z',
  },
  'review.received': {
    review_id: 'rev_sample_123',
    customer_id: 'cus_sample_123',
    customer_name: 'Jane Doe',
    rating: 5,
    comment: 'Amazing job, will book again!',
    received_at: '2026-06-29T15:00:00.000Z',
  },
};

export function buildSampleEnvelope(event: ZapierEvent, organizationId: string) {
  return {
    event,
    organization_id: organizationId,
    occurred_at: new Date().toISOString(),
    data: ZAPIER_SAMPLE_PAYLOADS[event],
  };
}
