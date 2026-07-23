import { supabase } from '@/lib/supabase';

/**
 * Fire-and-forget push send. Rings the recipient's phone even when the app
 * is closed — pairs with a cleaner_notifications bell insert.
 *
 * Contract note: send-push-notification currently targets by organization_id
 * (broadcast). `staff_id` is included for the targeted version of the edge
 * function (see Lovable prompt from 2026-07-20); until that ships, sends go
 * to org-registered devices only.
 */
export function sendPushBestEffort(params: {
  organizationId: string;
  staffId?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): void {
  void supabase.functions
    .invoke('send-push-notification', {
      body: {
        organization_id: params.organizationId,
        staff_id: params.staffId,
        title: params.title,
        body: params.body,
        data: params.data,
      },
    })
    .then(({ error }) => {
      if (error) console.error('[push] send failed:', error);
    })
    .catch((err) => console.error('[push] send failed:', err));
}

/**
 * Fire-and-forget admin notification for a completed booking. The edge
 * function inserts the admin bell row (deduped per booking) and pushes to
 * admin devices server-side — send-push-notification rejects client calls.
 */
export function notifyJobCompletedBestEffort(
  bookingId: string,
  completedBy: 'staff' | 'admin',
): void {
  void supabase.functions
    .invoke('notify-job-completed', {
      body: { bookingId, completedBy },
    })
    .then(({ error }) => {
      if (error) console.error('[notify-job-completed] failed:', error);
    })
    .catch((err) => console.error('[notify-job-completed] failed:', err));
}
