import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Navigation, Clock, MapPin, Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { calculateDistanceMiles, estimateDriveMinutes, formatDistance, formatDriveTime } from '@/lib/distanceUtils';

interface TrackingInfo {
  latitude: number;
  longitude: number;
  is_active: boolean;
  recorded_at: string;
  created_at: string;
}

interface OnTheWayInfo {
  sent_at: string;
}

function MiniMap({ lat, lng, destLat, destLng }: { lat: number; lng: number; destLat?: number; destLng?: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current).setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM',
      }).addTo(map);

      const cleanerIcon = L.divIcon({
        html: '<div style="background:#3b82f6;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',
        iconSize: [12, 12], iconAnchor: [6, 6], className: '',
      });
      markerRef.current = L.marker([lat, lng], { icon: cleanerIcon }).addTo(map);

      if (destLat && destLng) {
        const destIcon = L.divIcon({
          html: '<div style="background:#ef4444;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',
          iconSize: [12, 12], iconAnchor: [6, 6], className: '',
        });
        L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
        map.fitBounds(L.latLngBounds([[lat, lng], [destLat, destLng]]), { padding: [30, 30] });
      }

      mapInstanceRef.current = map;
    };
    init();
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
  }, [lat, lng]);

  return <div ref={mapRef} style={{ width: '100%', height: '200px', borderRadius: '8px' }} />;
}

export function AdminLiveTracking({ bookingId, address }: { bookingId: string; address?: string }) {
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);
  const [onTheWay, setOnTheWay] = useState<OnTheWayInfo | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // Check for active GPS tracking
      const { data: trackingData } = await supabase
        .from('cleaner_location_tracking')
        .select('latitude, longitude, is_active, recorded_at, created_at')
        .eq('booking_id', bookingId)
        .eq('is_active', true)
        .maybeSingle();

      if (trackingData) {
        setTracking(trackingData as any);
        return;
      }

      // Fallback: check if "on the way" SMS was sent (from booking_reminder_log)
      const { data: reminderData } = await supabase
        .from('booking_reminder_log')
        .select('sent_at')
        .eq('booking_id', bookingId)
        .eq('reminder_type', 'on_the_way')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reminderData) {
        setOnTheWay(reminderData as OnTheWayInfo);
      }
    };
    fetchData();

    // Realtime for GPS tracking
    const channel = supabase
      .channel(`admin-tracking-${bookingId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cleaner_location_tracking',
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        const d = payload.new as any;
        if (d.is_active) {
          setTracking(d);
        } else {
          setTracking(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  // Geocode destination
  useEffect(() => {
    if (!address || destCoords) return;
    // Only geocode if we have GPS tracking (for map display)
    if (!tracking) return;
    supabase.functions.invoke('geocode-address', { body: { address } })
      .then(res => {
        if (res.data?.lat && res.data?.lng) setDestCoords(res.data);
      })
      .catch(() => {});
  }, [address, tracking]);

  // Show GPS-based live tracking with map
  if (tracking) {
    const timeAgo = Math.round((Date.now() - new Date(tracking.recorded_at).getTime()) / 60000);
    const startedAt = new Date(tracking.created_at);
    let etaMinutes: number | null = null;
    let distanceMiles: number | null = null;
    if (destCoords) {
      distanceMiles = calculateDistanceMiles(tracking.latitude, tracking.longitude, destCoords.lat, destCoords.lng);
      etaMinutes = estimateDriveMinutes(distanceMiles);
    }

    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Live Tracking</span>
          </div>
          <Badge variant="default" className="bg-blue-600 text-xs">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-1" />
            En Route
          </Badge>
        </div>

        <MiniMap
          lat={tracking.latitude}
          lng={tracking.longitude}
          destLat={destCoords?.lat}
          destLng={destCoords?.lng}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>On the way since {startedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          {distanceMiles !== null && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="font-medium text-blue-600">
                {formatDistance(distanceMiles)} · ETA {formatDriveTime(etaMinutes!)}
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Updated {timeAgo < 1 ? 'just now' : `${timeAgo} min ago`}
        </p>
      </div>
    );
  }

  // Fallback: show "on the way" status from SMS log (no GPS)
  if (onTheWay) {
    const sentTime = new Date(onTheWay.sent_at);
    const minutesAgo = Math.round((Date.now() - sentTime.getTime()) / 60000);
    
    // Only show if sent within the last 2 hours (likely still relevant)
    if (minutesAgo > 120) return null;

    return (
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Cleaner En Route</span>
          </div>
          <Badge variant="default" className="bg-blue-600 text-xs">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse mr-1" />
            On The Way
          </Badge>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>
              "On My Way" sent at {sentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {minutesAgo > 0 && ` (${minutesAgo} min ago)`}
            </span>
          </div>
          <p className="text-muted-foreground/70 italic">
            GPS location unavailable — cleaner may not have granted location permissions
          </p>
        </div>
      </div>
    );
  }

  return null;
}
