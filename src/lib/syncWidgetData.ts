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
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return;
  }

  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        scheduled_at,
        address,
        customer:customers!inner(first_name, last_name),
        service:services(name)
      `)
      .neq('status', 'cancelled')
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Widget sync: failed to fetch next booking', error);
      return;
    }

    let widgetData: WidgetData;

    if (booking && booking.customer) {
      const customer = booking.customer as { first_name: string; last_name: string };
      const service = booking.service as { name: string } | null;

      widgetData = {
        bookingId: booking.id,
        customerName: `${customer.first_name} ${customer.last_name}`.trim(),
        serviceType: service?.name ?? 'Cleaning',
        address: booking.address ?? '',
        scheduledAt: booking.scheduled_at,
        isEmpty: false,
      };
    } else {
      widgetData = { isEmpty: true };
    }

    await WidgetBridge.syncBookingData({ json: JSON.stringify(widgetData) });
  } catch (err) {
    // Non-fatal — the widget just shows stale data
    console.error('Widget sync failed:', err);
  }
}
