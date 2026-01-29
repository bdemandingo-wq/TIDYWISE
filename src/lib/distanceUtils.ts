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
 * Normalize US address abbreviations to improve geocoding accuracy
 */
function normalizeUSAddress(address: string): string {
  let normalized = address.trim().toLowerCase();

  // Remove apartment/unit/suite identifiers – they often confuse geocoders
  // but don't matter for street-level distance.
  normalized = normalized
    .replace(/\b(apt|apartment|unit|suite|ste|bldg|building)\.?\s*#?\s*[\w-]+\b/gi, '')
    .replace(/\s+#\s*[\w-]+\b/gi, '')
    .replace(/\b(floor)\.?\s*\d+\b/gi, '');

  normalized = ` ${normalized} `;

  // Common street type abbreviations to expand
  const abbreviations: Record<string, string> = {
    ' rd ': ' road ',
    ' rd,': ' road,',
    ' st ': ' street ',
    ' st,': ' street,',
    ' ave ': ' avenue ',
    ' ave,': ' avenue,',
    ' blvd ': ' boulevard ',
    ' blvd,': ' boulevard,',
    ' dr ': ' drive ',
    ' dr,': ' drive,',
    ' ln ': ' lane ',
    ' ln,': ' lane,',
    ' ct ': ' court ',
    ' ct,': ' court,',
    ' cir ': ' circle ',
    ' cir,': ' circle,',
    ' pl ': ' place ',
    ' pl,': ' place,',
    ' pkwy ': ' parkway ',
    ' pkwy,': ' parkway,',
    ' hwy ': ' highway ',
    ' hwy,': ' highway,',
    ' trl ': ' trail ',
    ' trl,': ' trail,',
    ' ter ': ' terrace ',
    ' ter,': ' terrace,',
    ' way ': ' way ',
    ' way,': ' way,',
  };
  
  // Expand abbreviations
  for (const [abbr, full] of Object.entries(abbreviations)) {
    normalized = normalized.replace(new RegExp(abbr, 'gi'), full);
  }

  // Handle end-of-string abbreviations (e.g., "123 main rd" without trailing space)
  const endAbbreviations: Record<string, string> = {
    ' rd$': ' road',
    ' st$': ' street',
    ' ave$': ' avenue',
    ' blvd$': ' boulevard',
    ' dr$': ' drive',
    ' ln$': ' lane',
    ' ct$': ' court',
    ' cir$': ' circle',
    ' pl$': ' place',
    ' pkwy$': ' parkway',
    ' hwy$': ' highway',
    ' trl$': ' trail',
    ' ter$': ' terrace',
  };

  for (const [abbr, full] of Object.entries(endAbbreviations)) {
    normalized = normalized.replace(new RegExp(abbr, 'gi'), full);
  }

  // Expand a few street-type abbreviations (avoid "st" because it conflicts with "St Petersburg")
  normalized = normalized
    .replace(/\brd\b/gi, 'road')
    .replace(/\bave\b/gi, 'avenue')
    .replace(/\bblvd\b/gi, 'boulevard')
    .replace(/\bdr\b/gi, 'drive')
    .replace(/\bln\b/gi, 'lane')
    .replace(/\bct\b/gi, 'court')
    .replace(/\bcir\b/gi, 'circle')
    .replace(/\bpl\b/gi, 'place')
    .replace(/\bpkwy\b/gi, 'parkway')
    .replace(/\bhwy\b/gi, 'highway')
    .replace(/\btrl\b/gi, 'trail')
    .replace(/\bter\b/gi, 'terrace');

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // If the user typed a one-line US address without commas, try to format it as:
  // "street, city, ST ZIP" (this prevents the "city, ST , ZIP" mistake)
  const states =
    'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
  const oneLineMatch = normalized.match(
    new RegExp(`^(.*?)(?:,)?\\s+([a-z\\s.]+?)\\s+(${states})\\s+(\\d{5}(?:-\\d{4})?)\\s*$`, 'i')
  );
  if (oneLineMatch) {
    const street = oneLineMatch[1].replace(/\s+/g, ' ').trim();
    const city = oneLineMatch[2].replace(/\s+/g, ' ').trim();
    const state = oneLineMatch[3].toUpperCase();
    const zip = oneLineMatch[4];
    normalized = `${street}, ${city}, ${state} ${zip}`;
  }

  // Add "USA" to improve geocoding accuracy for US addresses
  if (!normalized.includes('usa') && !normalized.includes('united states')) {
    normalized = normalized.replace(/\s*,\s*$/, '');
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
