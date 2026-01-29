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

  let normalized = ` ${address.toLowerCase()} `;
  
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

  // Clean up state abbreviations - expand common ones
  const stateAbbreviations: Record<string, string> = {
    ' fl ': ' florida ',
    ' fl,': ' florida,',
    ' ca ': ' california ',
    ' ca,': ' california,',
    ' tx ': ' texas ',
    ' tx,': ' texas,',
    ' ny ': ' new york ',
    ' ny,': ' new york,',
    ' ga ': ' georgia ',
    ' ga,': ' georgia,',
    ' nc ': ' north carolina ',
    ' nc,': ' north carolina,',
    ' sc ': ' south carolina ',
    ' sc,': ' south carolina,',
    ' va ': ' virginia ',
    ' va,': ' virginia,',
    ' pa ': ' pennsylvania ',
    ' pa,': ' pennsylvania,',
    ' oh ': ' ohio ',
    ' oh,': ' ohio,',
    ' az ': ' arizona ',
    ' az,': ' arizona,',
    ' nv ': ' nevada ',
    ' nv,': ' nevada,',
    ' co ': ' colorado ',
    ' co,': ' colorado,',
  };

  for (const [abbr, full] of Object.entries(stateAbbreviations)) {
    normalized = normalized.replace(new RegExp(abbr, 'gi'), full);
  }

  // Add "USA" to improve geocoding accuracy for US addresses
  if (!normalized.includes('usa') && !normalized.includes('united states')) {
    normalized = normalized.trim() + ', usa';
  }

  return normalized.trim();
}

/**
 * Geocode an address using OpenStreetMap Nominatim
 * Returns null if geocoding fails
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Normalize the address for better geocoding results
    const normalizedAddress = normalizeUSAddress(address);
    console.log('[Geocode] Original:', address);
    console.log('[Geocode] Normalized:', normalizedAddress);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normalizedAddress)}&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': 'TidyWise/1.0' } }
    );
    const results = await response.json();
    
    if (results && results.length > 0) {
      console.log('[Geocode] Success:', results[0].display_name);
      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    }
    
    // If normalized search fails, try the original address as fallback
    console.log('[Geocode] Normalized failed, trying original...');
    const fallbackResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { 'User-Agent': 'TidyWise/1.0' } }
    );
    const fallbackResults = await fallbackResponse.json();
    
    if (fallbackResults && fallbackResults.length > 0) {
      console.log('[Geocode] Fallback success:', fallbackResults[0].display_name);
      return {
        lat: parseFloat(fallbackResults[0].lat),
        lng: parseFloat(fallbackResults[0].lon),
      };
    }
    
    console.log('[Geocode] Both attempts failed for:', address);
    return null;
  } catch (error) {
    console.error('Geocoding failed:', error);
    return null;
  }
}
