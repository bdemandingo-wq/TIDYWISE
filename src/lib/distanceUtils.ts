/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns distance in miles
 */
export function calculateDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Estimate drive time based on distance
 * Uses a rough average of 30 mph for urban/suburban driving
 * @returns estimated minutes
 */
export function estimateDriveMinutes(distanceMiles: number): number {
  const avgSpeedMph = 30; // Conservative estimate for mixed driving
  const hours = distanceMiles / avgSpeedMph;
  return Math.round(hours * 60);
}

/** Display unit for distances. Resolved from the org's country_code. */
export type DistanceUnit = 'mi' | 'km';

const KM_PER_MILE = 1.609344;

/**
 * Format distance for display.
 *
 * Everything upstream computes and passes MILES — the haversine, the
 * drive-time estimate, and get-driving-eta all stay in miles so their
 * heuristics keep their tuning. Conversion happens here and nowhere else,
 * so there is exactly one place a unit can go wrong.
 */
export function formatDistance(distanceMiles: number, unit: DistanceUnit = 'mi'): string {
  if (unit === 'km') {
    const km = distanceMiles * KM_PER_MILE;
    if (km < 0.1) return '< 0.1 km';
    return `${km.toFixed(1)} km`;
  }
  if (distanceMiles < 0.1) {
    return '< 0.1 mi';
  }
  return `${distanceMiles.toFixed(1)} mi`;
}

/**
 * Format drive time for display
 */
export function formatDriveTime(minutes: number): string {
  if (minutes < 1) {
    return '< 1 min';
  }
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `~${hours} hr`;
  }
  return `~${hours} hr ${remainingMinutes} min`;
}

/**
 * Geocode an address using the backend edge function (avoids CORS issues)
 * Falls back to direct Nominatim call if edge function unavailable
 * Returns null if geocoding fails
 */
export async function geocodeAddress(
  address: string,
  country?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const trimmed = address.trim();
    if (!trimmed) return null;
    if (trimmed.length > 300) return null;

    // Use supabase edge function to avoid CORS issues
    const { supabase } = await import('@/integrations/supabase/client');

    // country is the org's ISO-2 country_code. Omitting it makes
    // geocode-address fall back to its US-only behaviour, which returns
    // nothing for a Canadian address.
    const { data, error } = await supabase.functions.invoke('geocode-address', {
      body: { address: trimmed, ...(country ? { country } : {}) }
    });

    if (error) {
      console.error('Geocode edge function error:', error);
      return null;
    }

    if (data?.success && data.lat && data.lng) {
      return { lat: data.lat, lng: data.lng };
    }

    console.warn('Geocode failed:', data?.error || 'Unknown error');
    return null;
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}
