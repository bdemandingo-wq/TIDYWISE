import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Navigation, Clock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface TrackingInfo {
  latitude: number;
  longitude: number;
  is_active: boolean;
  recorded_at: string;
  created_at: string;
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
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('cleaner_location_tracking')
        .select('latitude, longitude, is_active, recorded_at, created_at')
        .eq('booking_id', bookingId)
        .eq('is_active', true)
        .maybeSingle();

      if (data) setTracking(data as any);
    };
    fetch();

    // Realtime
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
    supabase.functions.invoke('geocode-address', { body: { address } })
      .then(res => {
        if (res.data?.lat && res.data?.lng) setDestCoords(res.data);
      })
      .catch(() => {});
  }, [address]);

  if (!tracking) return null;

  const timeAgo = Math.round((Date.now() - new Date(tracking.recorded_at).getTime()) / 60000);
  const startedAt = new Date(tracking.created_at);
  let etaMinutes: number | null = null;
  if (destCoords) {
    const dist = haversineDistance(tracking.latitude, tracking.longitude, destCoords.lat, destCoords.lng);
    etaMinutes = Math.max(1, Math.round((dist / 25) * 60));
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
        {etaMinutes && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="font-medium text-blue-600">ETA ~{etaMinutes} min</span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Updated {timeAgo < 1 ? 'just now' : `${timeAgo} min ago`}
      </p>
    </div>
  );
}
