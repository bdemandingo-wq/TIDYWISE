import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  return normalized.trim();
}

function buildCandidates(normalizedAddress: string): string[] {
  const cleaned = normalizedAddress.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  
  if (tokens.length < 4) return [normalizedAddress];

  const zip = tokens[tokens.length - 1];
  const state = tokens[tokens.length - 2];

  const isZip = /^\d{5}(?:-\d{4})?$/.test(zip);
  const isState = /^[a-z]{2}$/i.test(state);
  
  if (!isZip || !isState) return [normalizedAddress];

  const prefix = tokens.slice(0, -2);
  if (prefix.length < 2) return [normalizedAddress];

  const streetSuffixes = new Set([
    'road', 'street', 'avenue', 'boulevard', 'drive', 'lane', 'court',
    'circle', 'place', 'parkway', 'highway', 'trail', 'terrace', 'way', 'cove'
  ]);

  const candidates: string[] = [];

  // Find street suffix
  let suffixIdx = -1;
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (streetSuffixes.has(prefix[i])) {
      suffixIdx = i;
      break;
    }
  }

  if (suffixIdx >= 0 && suffixIdx < prefix.length - 1) {
    const street = prefix.slice(0, suffixIdx + 1).join(' ').trim();
    const city = prefix.slice(suffixIdx + 1).join(' ').trim();
    if (street && city) {
      candidates.push(`${street}, ${city}, ${state.toUpperCase()} ${zip}`);
    }
  }

  // Fallback: assume city is last 1-3 tokens
  for (const cityLen of [1, 2, 3]) {
    if (prefix.length <= cityLen) continue;
    const street = prefix.slice(0, prefix.length - cityLen).join(' ').trim();
    const city = prefix.slice(prefix.length - cityLen).join(' ').trim();
    if (street && city) {
      const formatted = `${street}, ${city}, ${state.toUpperCase()} ${zip}`;
      if (!candidates.includes(formatted)) candidates.push(formatted);
    }
  }

  return candidates.length > 0 ? candidates : [normalizedAddress];
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

    for (const query of queries) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
          { 
            headers: { 
              'Accept': 'application/json',
              'User-Agent': 'TidywiseApp/1.0'
            } 
          }
        );
        
        const results = await response.json();
        
        if (results && results.length > 0) {
          console.log('Geocode success for:', query);
          return new Response(
            JSON.stringify({
              success: true,
              lat: parseFloat(results[0].lat),
              lng: parseFloat(results[0].lon),
              displayName: results[0].display_name
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (fetchError) {
        console.error('Fetch error for query:', query, fetchError);
      }
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
