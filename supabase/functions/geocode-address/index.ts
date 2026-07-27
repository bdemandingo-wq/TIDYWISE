import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEOCODE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

const APPROXIMATE_TYPES = new Set(['APPROXIMATE', 'GEOMETRIC_CENTER']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface GeocodeHit {
  lat: number;
  lng: number;
  displayName: string;
  approximate: boolean;
}

async function callGoogle(address: string, params: Record<string, string>): Promise<
  { hit: GeocodeHit } | { hit: null; status: string }
> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', GEOCODE_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) {
    if (data.status !== 'ZERO_RESULTS') {
      console.error('[geocode] Google returned', data.status, data.error_message ?? '');
    }
    return { hit: null, status: data.status ?? 'UNKNOWN_ERROR' };
  }

  const r = data.results[0];
  const loc = r.geometry?.location;
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
    return { hit: null, status: 'NO_LOCATION' };
  }

  return {
    hit: {
      lat: loc.lat,
      lng: loc.lng,
      displayName: r.formatted_address ?? '',
      approximate:
        APPROXIMATE_TYPES.has(r.geometry?.location_type ?? '') || r.partial_match === true,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!GEOCODE_KEY) {
    console.error('[geocode] GOOGLE_PLACES_API_KEY not configured');
    return json({ success: false, error: 'Geocoding not configured' });
  }

  try {
    const { address, country } = await req.json();

    if (!address || typeof address !== 'string') {
      return json({ success: false, error: 'Address is required' }, 400);
    }

    const trimmed = address.trim();
    if (!trimmed || trimmed.length > 300) {
      return json({ success: false, error: 'Invalid address' }, 400);
    }

    const cc = typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)
      ? country.toUpperCase()
      : 'US';

    const restricted = await callGoogle(trimmed, { components: `country:${cc}` });
    if (restricted.hit) {
      return json({ success: true, ...restricted.hit });
    }

    if (restricted.status === 'ZERO_RESULTS') {
      const biased = await callGoogle(trimmed, { region: cc.toLowerCase() });
      if (biased.hit) {
        return json({ success: true, ...biased.hit });
      }
    }

    return json({ success: false, error: 'Could not geocode address' });
  } catch (error: unknown) {
    console.error('[geocode] error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ success: false, error: message }, 500);
  }
});
