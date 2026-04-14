import { useState } from 'react';
import { MapPin, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface GpsCheckinProps {
  bookingId: string;
  staffId: string;
  organizationId: string;
  bookingAddress: string | null;
  type: 'check_in' | 'check_out';
  onSuccess?: () => void;
}

const NEARBY_METERS = 500; // within 500m counts as "at property"

function toRad(deg: number) { return deg * (Math.PI / 180); }

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function GpsCheckin({ bookingId, staffId, organizationId, bookingAddress, type, onSuccess }: GpsCheckinProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleCheckin = async () => {
    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );

      const { latitude, longitude } = pos.coords;
      let distanceMeters: number | null = null;
      let addressMatch: boolean | null = null;

      // Geocode the booking address to compare
      if (bookingAddress) {
        const { data: geocoded } = await supabase.functions.invoke('geocode-address', {
          body: { address: bookingAddress },
        });
        if (geocoded?.lat && geocoded?.lng) {
          distanceMeters = Math.round(haversineMeters(latitude, longitude, geocoded.lat, geocoded.lng));
          addressMatch = distanceMeters <= NEARBY_METERS;
        }
      }

      await supabase.from('booking_checkins').insert({
        booking_id: bookingId,
        staff_id: staffId,
        organization_id: organizationId,
        checkin_type: type,
        latitude,
        longitude,
        address_match: addressMatch,
        distance_meters: distanceMeters,
      });

      if (addressMatch === false && distanceMeters !== null) {
        toast.warning(`Checked in ${distanceMeters > 1000 ? `${(distanceMeters / 1000).toFixed(1)}km` : `${distanceMeters}m`} from the property address`, { duration: 5000 });
      } else {
        toast.success(type === 'check_in' ? 'Checked in at property' : 'Checked out from property');
      }

      setDone(true);
      onSuccess?.();
    } catch (e: any) {
      if (e.code === 1) {
        toast.error('Location access denied. Enable location in your device settings.');
      } else {
        // Still log without coordinates
        await supabase.from('booking_checkins').insert({
          booking_id: bookingId,
          staff_id: staffId,
          organization_id: organizationId,
          checkin_type: type,
          address_match: null,
        });
        setDone(true);
        onSuccess?.();
        toast.info(type === 'check_in' ? 'Checked in (no GPS)' : 'Checked out (no GPS)');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
        <CheckCircle className="w-3.5 h-3.5" />
        {type === 'check_in' ? 'Checked in' : 'Checked out'}
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-xs"
      onClick={handleCheckin}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
      {type === 'check_in' ? 'GPS Check-In' : 'GPS Check-Out'}
    </Button>
  );
}
