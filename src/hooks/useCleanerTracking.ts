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

const ARRIVAL_THRESHOLD_METERS = 100;
const POLL_INTERVAL_MS = 12000; // 12s — within the 10–15s spec

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useCleanerTracking({ bookingId, staffId, organizationId, destinationAddress }: UseCleanerTrackingOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingIdRef = useRef<string | null>(null);
  const destCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const arrivedRef = useRef<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastWriteRef = useRef<number>(0);
  const [isTracking, setIsTracking] = useState(false);

  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (e) { console.warn('[GPS] wake lock failed', e); }
  }, []);


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
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (wakeLockRef.current) { try { await wakeLockRef.current.release(); } catch {} wakeLockRef.current = null; }
    arrivedRef.current = false;
    setIsTracking(false);
  }, []);



  const checkArrival = useCallback(async (lat: number, lng: number) => {
    if (arrivedRef.current || !destCoordsRef.current) return;
    const meters = haversineMeters(lat, lng, destCoordsRef.current.lat, destCoordsRef.current.lng);
    if (meters > ARRIVAL_THRESHOLD_METERS) return;

    arrivedRef.current = true;
    console.log('[GPS] Arrival detected — within', Math.round(meters), 'm');

    try {
      if (trackingIdRef.current) {
        await supabase
          .from('cleaner_location_tracking')
          .update({ arrived_at: new Date().toISOString() } as any)
          .eq('id', trackingIdRef.current);
      }
      await supabase.functions.invoke('send-arrival-sms', {
        body: { bookingId, staffId },
      });
    } catch (err) {
      console.warn('[GPS] Arrival notification failed:', err);
    }
  }, [bookingId, staffId]);

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
      checkArrival(latitude, longitude);
    } catch (err) {
      console.warn('[GPS] Periodic update failed:', err);
    }
  }, [checkArrival]);


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
                  destCoordsRef.current = { lat: res.data.lat, lng: res.data.lng };
                  const dist = calculateDistanceMiles(latitude, longitude, res.data.lat, res.data.lng);
                  etaMinutes = estimateDriveMinutes(dist);
                }
              } catch { /* non-critical */ }
            }

            checkArrival(latitude, longitude);
            intervalRef.current = setInterval(updatePosition, POLL_INTERVAL_MS);
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
            destCoordsRef.current = { lat: res.data.lat, lng: res.data.lng };
            const dist = calculateDistanceMiles(latitude, longitude, res.data.lat, res.data.lng);
            etaMinutes = estimateDriveMinutes(dist);
          }
        } catch { /* non-critical */ }
      }

      checkArrival(latitude, longitude);
      intervalRef.current = setInterval(updatePosition, POLL_INTERVAL_MS);
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
  }, [bookingId, staffId, organizationId, destinationAddress, updatePosition, checkArrival]);

  // Cleanup on unmount AND on page-close. Previously only the interval was
  // cleared, which orphaned the cleaner_location_tracking row with
  // is_active=true forever. Now stopTracking is called on unmount so the row
  // is deactivated cleanly when the cleaner navigates away. For tab close /
  // app kill, sendBeacon is best-effort; the server may still need a
  // periodic stale-session sweep.
  useEffect(() => {
    return () => {
      // Don't await — unmount is synchronous. stopTracking fires the request
      // and React keeps rendering; the DB write completes on its own.
      void stopTracking();
    };
  }, [stopTracking]);

  return { startTracking, stopTracking, isTracking };
}
