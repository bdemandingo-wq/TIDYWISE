import { supabase } from '@/lib/supabase';

export type ZapierEvent =
  | 'customer.created'
  | 'booking.created'
  | 'booking.completed'
  | 'booking.cancelled'
  | 'invoice.paid'
  | 'lead.created'
  | 'estimate.sent'
  | 'review.received';

/**
 * Fire-and-forget Zapier dispatch.
 * Never throws — failures are logged server-side and swallowed here so the
 * caller's main flow is never affected by a Zapier outage.
 */
export async function dispatchZapier(
  event: ZapierEvent,
  organizationId: string | undefined | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!organizationId) return;
  try {
    await supabase.functions.invoke('zapier-dispatch', {
      body: { organization_id: organizationId, event_type: event, payload },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[zapier] dispatch failed', event, e);
  }
}
