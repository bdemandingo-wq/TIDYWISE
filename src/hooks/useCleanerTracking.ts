import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { calculateDistanceMiles, estimateDriveMinutes } from '@/lib/distanceUtils';

/**
 * Get current position using Capacitor native geolocation (preferred on mobile)
 * or browser geolocation as fallback.
 */
async function getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }): Promise<{ latitude: number; longitude: number }> {
  const opts = {
    enableHighAccuracy: options?.enableHighAccuracy ?? true,
    timeout: options?.timeout ?? 15000,
  };

  // Try Capacitor native geolocation first (better reliability on iOS/Android)
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    
    // Request permissions first on native
    const permStatus = await Geolocation.checkPermissions();
    if (permStatus.location === 'denied') {
      const requested = await Geolocation.requestPermissions();
      if (requested.location === 'denied') {
        throw new Error('Location permission denied');
      }
    }
    
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
    });
    
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (capacitorError: any) {
    // If Capacitor plugin not available (web), fall through to browser API
    if (capacitorError?.message?.includes('not implemented') || 
        capacitorError?.code === 'UNIMPLEMENTED' ||
        !('Capacitor' in window)) {
      // Fall through to browser geolocation
    } else {
      // Re-throw actual Capacitor errors (permission denied, timeout, etc.)
      throw capacitorError;
    }
  }

  // Fallback: browser geolocation API
  if (!navigator.geolocation) {
    throw new Error('GPS is not available on this device');
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
    });
  });

  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };
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
      const { latitude, longitude } = await getCurrentPosition({ timeout: 10000 });

      await supabase
        .from('cleaner_location_tracking')
        .update({
          latitude,
          longitude,
          recorded_at: new Date().toISOString(),
        } as any)
        .eq('id', trackingIdRef.current);
    } catch (err) {
      console.warn('GPS update failed:', err);
    }
  }, []);

  const startTracking = useCallback(async (): Promise<{
    trackingToken: string | null;
    etaMinutes: number | null;
    latitude: number;
    longitude: number;
  } | null> => {
    try {
      const { latitude, longitude } = await getCurrentPosition({ timeout: 15000 });

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

            // Calculate ETA
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
        console.error('Error inserting tracking:', error);
        return null;
      }

      trackingIdRef.current = data.id;

      // Calculate ETA
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
      if (err?.code === 1 || message.includes('denied')) {
        toast.error('Location access denied. Please enable GPS permissions in your device settings.');
      } else if (err?.code === 2 || message.includes('unavailable')) {
        toast.error('Unable to determine your location. Please try again.');
      } else if (err?.code === 3 || message.includes('timeout')) {
        toast.error('Location request timed out. Please try again.');
      } else {
        toast.error('Failed to get your location');
      }
      console.error('GPS tracking start failed:', err);
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
