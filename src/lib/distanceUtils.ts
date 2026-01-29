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

/**
 * Format distance for display
 */
export function formatDistance(distanceMiles: number): string {
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
 * Normalize US address for geocoding accuracy
 */
function normalizeUSAddress(address: string): string {
  let normalized = address.trim().toLowerCase();

  // Remove apartment/unit/suite identifiers – they confuse geocoders
  normalized = normalized
    .replace(/\b(apt|apartment|unit|suite|ste|bldg|building)\.?\s*#?\s*[\w-]+/gi, '')
    .replace(/\s+#[\w-]+/gi, '');

  // Replace common street abbreviations with full words
  const streetAbbrevs: [RegExp, string][] = [
    [/\brd\b/gi, 'road'],
    [/\bave\b/gi, 'avenue'],
    [/\bblvd\b/gi, 'boulevard'],
    [/\bdr\b/gi, 'drive'],
    [/\bln\b/gi, 'lane'],
    [/\bct\b/gi, 'court'],
    [/\bcir\b/gi, 'circle'],
    [/\bpl\b/gi, 'place'],
    [/\bpkwy\b/gi, 'parkway'],
    [/\bhwy\b/gi, 'highway'],
    [/\btrl\b/gi, 'trail'],
    [/\bter\b/gi, 'terrace'],
  ];
  for (const [pattern, replacement] of streetAbbrevs) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Remove double commas or trailing commas before state/zip
  normalized = normalized.replace(/,\s*,/g, ',').replace(/,\s*$/g, '');

  // Append USA if not present (helps Nominatim)
  if (!normalized.includes('usa') && !normalized.includes('united states')) {
    normalized = normalized + ', usa';
  }

  return normalized.trim();
}

/**
 * Geocode an address using OpenStreetMap Nominatim
 * Returns null if geocoding fails
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const trimmed = address.trim();
    if (!trimmed) return null;
    if (trimmed.length > 300) return null;

    // Normalize the address for better geocoding results
    const normalizedAddress = normalizeUSAddress(trimmed);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedAddress)}&limit=1&countrycodes=us`,
      { headers: { Accept: 'application/json' } }
    );
    const results = await response.json();
    
    if (results && results.length > 0) {
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
    
    // If normalized search fails, try the original address as fallback
    const fallbackResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&countrycodes=us`,
      { headers: { Accept: 'application/json' } }
    );
    const fallbackResults = await fallbackResponse.json();
    
    if (fallbackResults && fallbackResults.length > 0) {
      return {
        lat: parseFloat(fallbackResults[0].lat),
        lng: parseFloat(fallbackResults[0].lon),
      };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}
