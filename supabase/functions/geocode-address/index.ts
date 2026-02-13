import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Common concatenated city name corrections
const cityCorrections: Record<string, string> = {
  'westpalm': 'west palm',
  'fortlauderdale': 'fort lauderdale',
  'fortmyers': 'fort myers',
  'fortpierce': 'fort pierce',
  'portcharlotte': 'port charlotte',
  'portstlucie': 'port st lucie',
  'pompanobeach': 'pompano beach',
  'palmbeach': 'palm beach',
  'palmcoast': 'palm coast',
  'palmharbor': 'palm harbor',
  'coralgables': 'coral gables',
  'coralsprings': 'coral springs',
  'bocaraton': 'boca raton',
  'boyntonbeach': 'boynton beach',
  'deerfieldbeach': 'deerfield beach',
  'daytonabeach': 'daytona beach',
  'cocoacbeach': 'cocoa beach',
  'miamibeach': 'miami beach',
  'jacksonvillebeach': 'jacksonville beach',
  'newsmyrnabeach': 'new smyrna beach',
  'sanantonio': 'san antonio',
  'sanfrancisco': 'san francisco',
  'sandiego': 'san diego',
  'sanjose': 'san jose',
  'losangeles': 'los angeles',
  'lasvegas': 'las vegas',
  'newyork': 'new york',
  'newjersey': 'new jersey',
  'neworleans': 'new orleans',
  'longbeach': 'long beach',
  'virginiabeach': 'virginia beach',
  'myrtlebeach': 'myrtle beach',
};

function applyCityCorrections(text: string): string {
  let result = text;
  for (const [wrong, correct] of Object.entries(cityCorrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    result = result.replace(regex, correct);
  }
  return result;
}

function normalizeUSAddress(address: string): string {
  let normalized = address.trim().toLowerCase();

  // Remove apartment/unit/suite identifiers
  normalized = normalized
    .replace(/\b(apt|apartment|unit|suite|ste|bldg|building)\.?\s*#?\s*[\w-]+/gi, '')
    .replace(/\s+#[\w-]+/gi, '');

  // Replace common street abbreviations
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
  normalized = normalized.replace(/,\s*,/g, ',').replace(/,\s*$/g, '');

  // Apply city name corrections
  normalized = applyCityCorrections(normalized);

  return normalized.trim();
}

function buildCandidates(normalizedAddress: string): string[] {
  const candidates: string[] = [];

  // Strategy 1: If commas exist, parse structured format directly
  const commaParts = normalizedAddress.split(',').map(p => p.trim()).filter(Boolean);
  if (commaParts.length >= 3) {
    const street = commaParts[0];
    const stateZipParts = commaParts.slice(1).join(' ').trim().split(/\s+/);
    // Try to find state and zip from remaining parts
    const zip = stateZipParts.find(t => /^\d{5}(?:-\d{4})?$/.test(t));
    const state = stateZipParts.find(t => /^[a-z]{2}$/i.test(t));
    if (zip && state) {
      // Everything between street and state/zip is city
      const middleParts = commaParts.slice(1).join(' ').replace(zip, '').replace(new RegExp(`\\b${state}\\b`, 'i'), '').trim();
      if (middleParts) {
        candidates.push(`${street}, ${middleParts}, ${state.toUpperCase()} ${zip}`);
      } else {
        // City might be embedded in the street part - extract it
        const streetTokens = street.split(/\s+/);
        const streetSuffixes = new Set(['road','street','avenue','boulevard','drive','lane','court','circle','place','parkway','highway','trail','terrace','way','cove']);
        let suffixIdx = -1;
        for (let i = streetTokens.length - 1; i >= 0; i--) {
          if (streetSuffixes.has(streetTokens[i])) { suffixIdx = i; break; }
        }
        if (suffixIdx >= 0 && suffixIdx < streetTokens.length - 1) {
          const st = streetTokens.slice(0, suffixIdx + 1).join(' ');
          const city = streetTokens.slice(suffixIdx + 1).join(' ');
          candidates.push(`${st}, ${city}, ${state.toUpperCase()} ${zip}`);
        }
      }
    }
  } else if (commaParts.length === 2) {
    // Format: "street city, ST ZIP"
    const secondPart = commaParts[1].trim().split(/\s+/);
    const zip = secondPart.find(t => /^\d{5}(?:-\d{4})?$/.test(t));
    const state = secondPart.find(t => /^[a-z]{2}$/i.test(t));
    if (zip && state) {
      const street = commaParts[0];
      const streetTokens = street.split(/\s+/);
      const streetSuffixes = new Set(['road','street','avenue','boulevard','drive','lane','court','circle','place','parkway','highway','trail','terrace','way','cove']);
      let suffixIdx = -1;
      for (let i = streetTokens.length - 1; i >= 0; i--) {
        if (streetSuffixes.has(streetTokens[i])) { suffixIdx = i; break; }
      }
      if (suffixIdx >= 0 && suffixIdx < streetTokens.length - 1) {
        const st = streetTokens.slice(0, suffixIdx + 1).join(' ');
        const city = streetTokens.slice(suffixIdx + 1).join(' ');
        candidates.push(`${st}, ${city}, ${state.toUpperCase()} ${zip}`);
      }
    }
  }

  // Strategy 2: Word-based heuristic (original logic)
  const cleaned = normalizedAddress.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  
  if (tokens.length >= 4) {
    const zip = tokens[tokens.length - 1];
    const state = tokens[tokens.length - 2];
    const isZip = /^\d{5}(?:-\d{4})?$/.test(zip);
    const isState = /^[a-z]{2}$/i.test(state);
    
    if (isZip && isState) {
      const prefix = tokens.slice(0, -2);
      if (prefix.length >= 2) {
        const streetSuffixes = new Set([
          'road', 'street', 'avenue', 'boulevard', 'drive', 'lane', 'court',
          'circle', 'place', 'parkway', 'highway', 'trail', 'terrace', 'way', 'cove'
        ]);

        let suffixIdx = -1;
        for (let i = prefix.length - 1; i >= 0; i--) {
          if (streetSuffixes.has(prefix[i])) { suffixIdx = i; break; }
        }

        if (suffixIdx >= 0 && suffixIdx < prefix.length - 1) {
          const street = prefix.slice(0, suffixIdx + 1).join(' ');
          const city = prefix.slice(suffixIdx + 1).join(' ');
          if (street && city) {
            const formatted = `${street}, ${city}, ${state.toUpperCase()} ${zip}`;
            if (!candidates.includes(formatted)) candidates.push(formatted);
          }
        }

        for (const cityLen of [1, 2, 3]) {
          if (prefix.length <= cityLen) continue;
          const street = prefix.slice(0, prefix.length - cityLen).join(' ');
          const city = prefix.slice(prefix.length - cityLen).join(' ');
          if (street && city) {
            const formatted = `${street}, ${city}, ${state.toUpperCase()} ${zip}`;
            if (!candidates.includes(formatted)) candidates.push(formatted);
          }
        }
      }
    }
  }

  return candidates.length > 0 ? candidates : [normalizedAddress];
}
function parseStructuredAddress(normalized: string, original: string): { street: string; city: string; state: string; zip: string } | null {
  // Try parsing from the normalized comma-separated format
  const commaParts = normalized.split(',').map(p => p.trim()).filter(Boolean);
  
  if (commaParts.length >= 2) {
    // Find state and zip in the parts
    for (let i = 1; i < commaParts.length; i++) {
      const tokens = commaParts[i].split(/\s+/).filter(Boolean);
      const state = tokens.find(t => /^[a-z]{2}$/i.test(t));
      const zip = tokens.find(t => /^\d{5}(?:-\d{4})?$/.test(t));
      
      if (state && zip) {
        const street = commaParts[0];
        // Extract city: check if it's in the street part (after street suffix) or in middle comma parts
        const middleParts = commaParts.slice(1, i).map(p => p.trim()).filter(Boolean);
        
        const streetSuffixes = new Set(['road','street','avenue','boulevard','drive','lane','court','circle','place','parkway','highway','trail','terrace','way','cove']);
        const streetTokens = street.split(/\s+/);
        let suffixIdx = -1;
        for (let j = streetTokens.length - 1; j >= 0; j--) {
          if (streetSuffixes.has(streetTokens[j])) { suffixIdx = j; break; }
        }
        
        let city = middleParts.join(' ');
        let streetOnly = street;
        
        if (!city && suffixIdx >= 0 && suffixIdx < streetTokens.length - 1) {
          streetOnly = streetTokens.slice(0, suffixIdx + 1).join(' ');
          city = streetTokens.slice(suffixIdx + 1).join(' ');
        }
        
        if (streetOnly && city) {
          return { street: streetOnly, city, state: state.toUpperCase(), zip };
        }
      }
    }
  }
  
  // Try from original input with commas
  const origParts = original.split(',').map(p => p.trim()).filter(Boolean);
  if (origParts.length >= 3) {
    const lastPart = origParts[origParts.length - 1].trim();
    const secondLast = origParts[origParts.length - 2].trim();
    const zip = /^\d{5}(?:-\d{4})?$/.test(lastPart) ? lastPart : null;
    const state = /^[a-z]{2}$/i.test(secondLast) ? secondLast : null;
    
    if (zip && state) {
      const streetCity = applyCityCorrections(origParts.slice(0, -2).join(', ').toLowerCase());
      const streetSuffixes = new Set(['road','street','avenue','boulevard','drive','lane','court','circle','place','parkway','highway','trail','terrace','way','cove']);
      const tokens = streetCity.split(/\s+/);
      let suffixIdx = -1;
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (streetSuffixes.has(tokens[j])) { suffixIdx = j; break; }
      }
      if (suffixIdx >= 0 && suffixIdx < tokens.length - 1) {
        return {
          street: tokens.slice(0, suffixIdx + 1).join(' '),
          city: tokens.slice(suffixIdx + 1).join(' '),
          state: state.toUpperCase(),
          zip,
        };
      }
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();
    
    if (!address || typeof address !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const trimmed = address.trim();
    if (!trimmed || trimmed.length > 300) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalized = normalizeUSAddress(trimmed);
    const candidates = buildCandidates(normalized);
    
    // Add USA suffix and original input
    const queries = [
      ...candidates.map(c => c.includes('usa') ? c : `${c}, usa`),
      trimmed
    ];

    console.log('Geocoding candidates:', queries);

    // Strategy A: Try structured search first (most reliable)
    const structuredParts = parseStructuredAddress(normalized, trimmed);
    if (structuredParts) {
      try {
        const params = new URLSearchParams({
          format: 'json',
          street: structuredParts.street,
          city: structuredParts.city,
          state: structuredParts.state,
          postalcode: structuredParts.zip,
          countrycodes: 'us',
          limit: '1',
        });
        console.log('Trying structured search:', structuredParts);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'TidywiseApp/1.0' } }
        );
        const results = await response.json();
        if (results && results.length > 0) {
          console.log('Structured geocode success');
          return new Response(
            JSON.stringify({ success: true, lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), displayName: results[0].display_name }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) { console.error('Structured search error:', e); }
    }

    // Strategy B: Free-text candidates
    for (const query of queries) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'TidywiseApp/1.0' } }
        );
        const results = await response.json();
        if (results && results.length > 0) {
          console.log('Geocode success for:', query);
          return new Response(
            JSON.stringify({ success: true, lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), displayName: results[0].display_name }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (fetchError) {
        console.error('Fetch error for query:', query, fetchError);
      }
    }

    // Strategy C: Fallback to city/state/zip only for approximate location
    if (structuredParts) {
      try {
        const fallbackQuery = `${structuredParts.city}, ${structuredParts.state} ${structuredParts.zip}`;
        console.log('Trying city-level fallback:', fallbackQuery);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1&countrycodes=us`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'TidywiseApp/1.0' } }
        );
        const results = await response.json();
        if (results && results.length > 0) {
          console.log('City-level fallback success');
          return new Response(
            JSON.stringify({ success: true, lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), displayName: results[0].display_name, approximate: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) { console.error('Fallback error:', e); }
    }

    // Return 200 with success:false so Supabase client doesn't throw FunctionsHttpError
    return new Response(
      JSON.stringify({ success: false, error: 'Could not geocode address' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Geocode error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
