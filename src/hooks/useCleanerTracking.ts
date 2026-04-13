import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { calculateDistanceMiles, estimateDriveMinutes } from '@/lib/distanceUtils';

/**
 * Get current position — tries browser geolocation first (works everywhere
 * and always triggers the permission prompt), then Capacitor native as fallback.
 */
async function getCurrentPosition(timeoutMs = 15000): Promise<{ latitude: number; longitude: number }> {
  // 1) Try browser geolocation first — this works on both web AND Capacitor WebView
  //    and will trigger the native permission dialog if not yet granted.
  if (navigator.geolocation) {
    try {
      console.log('[GPS] Attempting browser geolocation...');
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        });
      });
      console.log('[GPS] Browser geolocation succeeded:', pos.coords.latitude, pos.coords.longitude);
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (browserError: any) {
      console.warn('[GPS] Browser geolocation failed:', browserError?.code, browserError?.message);
      // PERMISSION_DENIED (code 1) — don't try Capacitor, user said no
      if (browserError?.code === 1) {
        throw new Error('Location permission denied by user');
      }
      // For timeout (3) or position unavailable (2), try Capacitor as fallback
    }
  }

  // 2) Fallback: Capacitor native geolocation plugin
  try {
    console.log('[GPS] Attempting Capacitor geolocation...');
    const { Geolocation } = await import('@capacitor/geolocation');

    const permStatus = await Geolocation.checkPermissions();
    console.log('[GPS] Capacitor permission status:', permStatus.location);

    if (permStatus.location === 'denied') {
      const requested = await Geolocation.requestPermissions();
      console.log('[GPS] Capacitor permission after request:', requested.location);
      if (requested.location === 'denied') {
        throw new Error('Location permission denied');
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: timeoutMs,
    });
    console.log('[GPS] Capacitor geolocation succeeded:', position.coords.latitude, position.coords.longitude);
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (capError: any) {
    console.warn('[GPS] Capacitor geolocation failed:', capError?.message || capError);
    // If Capacitor not available, just throw
    throw new Error(capError?.message || 'Unable to get location');
  }
}

interface UseCleanerTrackingOptions {
  bookingId: string;
  staffId: string;
  organizationId: string;
  destinationAddress?: string;
}

export function useCleanerTracking({ bookingId, staffId, organizationId, destinationAddress }: UseCleanerTrackingOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingIdRef = useRef<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const stopTracking = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (trackingIdRef.current) {
      await supabase
        .from('cleaner_location_tracking')
        .update({ is_active: false } as any)
        .eq('id', trackingIdRef.current);
      trackingIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const updatePosition = useCallback(async () => {
    if (!trackingIdRef.current) return;

    try {
      const { latitude, longitude } = await getCurrentPosition(10000);

      await supabase
        .from('cleaner_location_tracking')
        .update({
          latitude,
          longitude,
          recorded_at: new Date().toISOString(),
        } as any)
        .eq('id', trackingIdRef.current);
    } catch (err) {
      console.warn('[GPS] Periodic update failed:', err);
    }
  }, []);

  const startTracking = useCallback(async (): Promise<{
    trackingToken: string | null;
    etaMinutes: number | null;
    latitude: number;
    longitude: number;
  } | null> => {
    console.log('[GPS] startTracking called for booking:', bookingId);

    try {
      const { latitude, longitude } = await getCurrentPosition(15000);
      console.log('[GPS] Got position:', latitude, longitude);

      // Insert tracking record
      const { data, error } = await supabase
        .from('cleaner_location_tracking')
        .insert({
          booking_id: bookingId,
          staff_id: staffId,
          organization_id: organizationId,
          latitude,
          longitude,
        } as any)
        .select('id, tracking_token')
        .single();

      if (error) {
        console.error('[GPS] Insert error:', error);
        // If there's already an active tracking for this booking, update it
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('cleaner_location_tracking')
            .select('id, tracking_token')
            .eq('booking_id', bookingId)
            .eq('is_active', true)
            .single();

          if (existing) {
            trackingIdRef.current = existing.id;
            await supabase
              .from('cleaner_location_tracking')
              .update({ latitude, longitude, recorded_at: new Date().toISOString() } as any)
              .eq('id', existing.id);

            let etaMinutes: number | null = null;
            if (destinationAddress) {
              try {
                const res = await supabase.functions.invoke('geocode-address', {
                  body: { address: destinationAddress },
                });
                if (res.data?.lat && res.data?.lng) {
                  const dist = calculateDistanceMiles(latitude, longitude, res.data.lat, res.data.lng);
                  etaMinutes = estimateDriveMinutes(dist);
                }
              } catch { /* non-critical */ }
            }

            intervalRef.current = setInterval(updatePosition, 30000);
            setIsTracking(true);

            return {
              trackingToken: (existing as any).tracking_token,
              etaMinutes,
              latitude,
              longitude,
            };
          }
        }
        return null;
      }

      console.log('[GPS] Tracking record created:', data.id);
      trackingIdRef.current = data.id;

      let etaMinutes: number | null = null;
      if (destinationAddress) {
        try {
          const res = await supabase.functions.invoke('geocode-address', {
            body: { address: destinationAddress },
          });
          if (res.data?.lat && res.data?.lng) {
            const dist = calculateDistanceMiles(latitude, longitude, res.data.lat, res.data.lng);
            etaMinutes = estimateDriveMinutes(dist);
          }
        } catch { /* non-critical */ }
      }

      intervalRef.current = setInterval(updatePosition, 30000);
      setIsTracking(true);

      return {
        trackingToken: (data as any).tracking_token,
        etaMinutes,
        latitude,
        longitude,
      };
    } catch (err: any) {
      const message = err?.message || '';
      console.error('[GPS] startTracking failed:', message, err);

      if (message.includes('denied')) {
        toast.error('Location access denied. Please enable GPS in your device settings.');
      } else if (message.includes('unavailable')) {
        toast.error('Unable to determine your location. Please try again.');
      } else if (message.includes('timeout') || err?.code === 3) {
        toast.error('Location request timed out. Please try again.');
      } else {
        toast.error('Failed to get your location');
      }
      return null;
    }
  }, [bookingId, staffId, organizationId, destinationAddress, updatePosition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { startTracking, stopTracking, isTracking };
}
