import { supabase } from '@/lib/supabase';
import { dispatchGhl } from '@/lib/ghl';

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
 * Fire-and-forget dispatch to ALL configured outbound integrations
 * (Zapier + GoHighLevel). Never throws — failures are logged server-side and
 * swallowed here so the caller's main flow is never affected by an integration
 * outage.
 */
export async function dispatchZapier(
  event: ZapierEvent,
  organizationId: string | undefined | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!organizationId) return;
  // Fan out in parallel; either path may be unconfigured / disabled.
  await Promise.allSettled([
    (async () => {
      try {
        await supabase.functions.invoke('zapier-dispatch', {
          body: { organization_id: organizationId, event_type: event, payload },
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[zapier] dispatch failed', event, e);
      }
    })(),
    dispatchGhl(event, organizationId, payload),
  ]);
}
