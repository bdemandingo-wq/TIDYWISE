import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Haversine distance in miles
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    // Mark tracking as inactive
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
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      await supabase
        .from('cleaner_location_tracking')
        .update({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
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
    if (!navigator.geolocation) {
      toast.error('GPS is not available on this device');
      return null;
    }

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });

      const { latitude, longitude } = pos.coords;

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
                  const dist = haversineDistance(latitude, longitude, res.data.lat, res.data.lng);
                  etaMinutes = Math.max(1, Math.round((dist / 25) * 60));
                }
              } catch { /* non-critical */ }
            }

            // Start interval
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
            const dist = haversineDistance(latitude, longitude, res.data.lat, res.data.lng);
            etaMinutes = Math.max(1, Math.round((dist / 25) * 60));
          }
        } catch { /* non-critical */ }
      }

      // Start periodic GPS updates
      intervalRef.current = setInterval(updatePosition, 30000);
      setIsTracking(true);

      return {
        trackingToken: (data as any).tracking_token,
        etaMinutes,
        latitude,
        longitude,
      };
    } catch (err: any) {
      if (err?.code === 1) {
        toast.error('Location access denied. Please enable GPS permissions.');
      } else if (err?.code === 2) {
        toast.error('Unable to determine your location. Please try again.');
      } else if (err?.code === 3) {
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
