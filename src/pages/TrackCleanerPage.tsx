import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { MapPin, Clock, CheckCircle2, Navigation, Loader2, Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { calculateDistanceMiles, estimateDriveMinutes, formatDistance, formatDriveTime } from '@/lib/distanceUtils';

interface TrackingData {
  latitude: number;
  longitude: number;
  is_active: boolean;
  recorded_at: string;
  staff: { name: string } | null;
  booking: {
    booking_number: number;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  } | null;
}

// Lazy load leaflet components
function TrackingMap({ cleanerLat, cleanerLng, destLat, destLng }: {
  cleanerLat: number; cleanerLng: number; destLat?: number; destLng?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const cleanerMarkerRef = useRef<any>(null);

  useEffect(() => {
    let L: any;
    const initMap = async () => {
      L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      if (!mapRef.current || mapInstanceRef.current) return;

      const map = L.map(mapRef.current).setView([cleanerLat, cleanerLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      const cleanerIcon = L.divIcon({
        html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: '',
      });
      cleanerMarkerRef.current = L.marker([cleanerLat, cleanerLng], { icon: cleanerIcon })
        .addTo(map)
        .bindPopup('Cleaner location');

      if (destLat && destLng) {
        const destIcon = L.divIcon({
          html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          className: '',
        });
        L.marker([destLat, destLng], { icon: destIcon }).addTo(map).bindPopup('Destination');

        const bounds = L.latLngBounds([
          [cleanerLat, cleanerLng],
          [destLat, destLng],
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (cleanerMarkerRef.current) {
      cleanerMarkerRef.current.setLatLng([cleanerLat, cleanerLng]);
    }
  }, [cleanerLat, cleanerLng]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '300px' }} />;
}

export default function TrackCleanerPage() {
  const { token } = useParams<{ token: string }>();
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noGpsYet, setNoGpsYet] = useState(false);

  const fetchTracking = async () => {
    if (!token) return;

    const { data, error: fetchError } = await supabase
      .from('cleaner_location_tracking')
      .select(`
        latitude, longitude, is_active, recorded_at,
        staff:staff_id(name),
        booking:booking_id(booking_number, address, city, state, zip_code)
      `)
      .eq('tracking_token', token)
      .maybeSingle();

    if (fetchError) {
      setError('Unable to load tracking information.');
      setLoading(false);
      return;
    }

    if (!data) {
      // No tracking record found — could be GPS not enabled yet
      setNoGpsYet(true);
      setLoading(false);
      return;
    }

    const staff = Array.isArray(data.staff) ? data.staff[0] : data.staff;
    const booking = Array.isArray(data.booking) ? data.booking[0] : data.booking;

    setTracking({
      ...data,
      staff: staff as any,
      booking: booking as any,
    });
    setNoGpsYet(false);
    setLoading(false);

    if (booking && !destCoords) {
      const b = booking as any;
      const addr = [b.address, b.city, b.state, b.zip_code].filter(Boolean).join(', ');
      if (addr) {
        try {
          const res = await supabase.functions.invoke('geocode-address', {
            body: { address: addr },
          });
          if (res.data?.lat && res.data?.lng) {
            setDestCoords({ lat: res.data.lat, lng: res.data.lng });
          }
        } catch {
          // Non-critical
        }
      }
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchTracking();
  }, [token]);

  // Realtime subscription for live updates
  useEffect(() => {
    if (!token) return;

    const channel = supabase
      .channel(`tracking-${token}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cleaner_location_tracking',
        filter: `tracking_token=eq.${token}`,
      }, (payload) => {
        const newData = payload.new as any;
        if (newData && newData.latitude) {
          setTracking(prev => prev ? {
            ...prev,
            latitude: newData.latitude,
            longitude: newData.longitude,
            is_active: newData.is_active,
            recorded_at: newData.recorded_at,
          } : null);
          setNoGpsYet(false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [token]);

  // Poll every 30s as fallback
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(fetchTracking, 30000);
    return () => clearInterval(interval);
  }, [token, destCoords]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">Loading tracking...</p>
        </div>
      </div>
    );
  }

  // No GPS data yet — show friendly waiting message
  if (noGpsYet || (error && !tracking)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
              <div className="relative w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Car className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <h2 className="text-lg font-semibold">Your cleaner is on the way!</h2>
            <p className="text-muted-foreground text-sm">
              Live location will appear once they enable GPS sharing.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Checking for updates...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tracking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Tracking Unavailable</h2>
            <p className="text-muted-foreground">No tracking data found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cleaner has arrived
  if (!tracking.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-green-700 mb-2">Your Cleaner Has Arrived!</h2>
            {tracking.staff?.name && (
              <p className="text-muted-foreground">{tracking.staff.name} is at the location.</p>
            )}
            {tracking.booking && (
              <p className="text-sm text-muted-foreground mt-2">
                Booking #{tracking.booking.booking_number}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate ETA
  let etaMinutes: number | null = null;
  let distanceMiles: number | null = null;
  if (destCoords) {
    distanceMiles = calculateDistanceMiles(tracking.latitude, tracking.longitude, destCoords.lat, destCoords.lng);
    etaMinutes = estimateDriveMinutes(distanceMiles);
  }

  const lastUpdate = new Date(tracking.recorded_at);
  const timeAgo = Math.round((Date.now() - lastUpdate.getTime()) / 60000);

  return (
    <div className="min-h-screen bg-background">
      {/* Map */}
      <div className="h-[50vh] w-full relative">
        <TrackingMap
          cleanerLat={tracking.latitude}
          cleanerLng={tracking.longitude}
          destLat={destCoords?.lat}
          destLng={destCoords?.lng}
        />
      </div>

      {/* Info panel */}
      <div className="p-4 -mt-6 relative z-10">
        <Card className="max-w-lg mx-auto shadow-lg">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                <span className="font-semibold text-lg">
                  {tracking.staff?.name || 'Your cleaner'}
                </span>
              </div>
              <Badge variant="default">
                <Navigation className="h-3 w-3 mr-1" />
                En Route
              </Badge>
            </div>

            {etaMinutes !== null && (
              <div className="bg-primary/5 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-primary">~{etaMinutes} min</p>
                <p className="text-sm text-primary/80">Estimated arrival</p>
                {distanceMiles !== null && (
                  <p className="text-xs text-primary/60 mt-1">{formatDistance(distanceMiles)} away</p>
                )}
              </div>
            )}

            {tracking.booking?.address && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {tracking.booking.address}
                  {tracking.booking.city ? `, ${tracking.booking.city}` : ''}
                  {tracking.booking.state ? ` ${tracking.booking.state}` : ''}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Updated {timeAgo < 1 ? 'just now' : `${timeAgo} min ago`}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
