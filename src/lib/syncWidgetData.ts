import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import WidgetBridge from '@/lib/widgetBridge';

interface WidgetBookingData {
  bookingId: string;
  customerName: string;
  serviceType: string;
  address: string;
  scheduledAt: string;
  isEmpty: false;
}

interface WidgetEmptyData {
  isEmpty: true;
}

type WidgetData = WidgetBookingData | WidgetEmptyData;

export async function syncWidgetData(): Promise<void> {
  // Only runs on native iOS — widgets don't exist on web
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Ensure we have an active session before querying — on app resume the
    // auth token may not be refreshed yet.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return;
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        scheduled_at,
        address,
        customer:customers(first_name, last_name),
        service:services(name)
      `)
      .neq('status', 'cancelled')
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[WidgetSync] query error:', error.message);
      return;
    }

    let widgetData: WidgetData;

    if (booking) {
      const customer = booking.customer as { first_name: string; last_name: string } | null;
      const service = booking.service as { name: string } | null;

      widgetData = {
        bookingId: booking.id,
        customerName: customer
          ? `${customer.first_name} ${customer.last_name}`.trim()
          : 'Customer',
        serviceType: service?.name ?? 'Cleaning',
        address: booking.address ?? '',
        scheduledAt: booking.scheduled_at,
        isEmpty: false,
      };
    } else {
      widgetData = { isEmpty: true };
    }

    console.log('[WidgetSync] writing:', JSON.stringify(widgetData));
    await WidgetBridge.syncBookingData({ json: JSON.stringify(widgetData) });
    console.log('[WidgetSync] success');
  } catch (err) {
    console.error('[WidgetSync] failed:', err);
  }
}
