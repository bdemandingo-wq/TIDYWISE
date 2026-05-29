// Resolve a Google Maps share link (or full Maps URL) to a canonical
// Place ID. This is the deterministic, unambiguous identifier Google
// uses for a business location — using it bypasses the brittle "search
// by name + city + state" fallback that frequently mis-matches or
// returns nothing.
//
// Strategies, tried in order:
//   1. Follow redirects on share.google / maps.app.goo.gl short links
//   2. Pull place_id directly from a query param if Google included one
//   3. Parse the FTID (!1s0x...:0x...) from the path and use Places API
//      Find Place to canonicalize it
//   4. Fall back to Places Text Search using the business name + the
//      lat/lng @-tag baked into the canonical URL
//
// Returns { place_id, name, formatted_address, latitude?, longitude? }
// on success, or 4xx with a human error on failure.
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

const Body = z.object({
  url: z.string().trim().min(1).max(2048),
});

// Cap redirects so a misbehaving short-link service can't make us
// hop forever.
const MAX_REDIRECTS = 5;

async function followRedirects(input: string): Promise<string> {
  let current = input;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      // IMPORTANT: use a crawler-style UA. Modern browser UAs cause
      // maps.app.goo.gl to return a JS-only "Durable Deep Link" page
      // with NO Location header — there's nothing to follow. With a
      // crawler UA Google server-side renders a clean 302 to the
      // canonical /maps/place/... URL that contains the FTID we need.
      headers: {
        "User-Agent":
          "Googlebot/2.1 (+http://www.google.com/bot.html)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const loc = res.headers.get("location");
    if (!loc) {
      // Some Google share links return 200 with a meta-refresh redirect
      // inside the HTML body instead of a 30x Location header.
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html")) {
        const html = await res.text();
        const meta = html.match(
          /<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>\s]+)/i
        );
        if (meta?.[1]) {
          current = new URL(meta[1], current).toString();
          continue;
        }
        const canonical = html.match(
          /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
        );
        if (canonical?.[1]) return canonical[1];
      }
      return current;
    }
    current = new URL(loc, current).toString();
  }
  return current;
}

function parseQueryPlaceId(u: URL): string | null {
  // Google sometimes includes place_id directly as a query param —
  // typically when the URL came from the Places API itself.
  return u.searchParams.get("place_id");
}

function parseFtid(u: URL): string | null {
  // The canonical Maps URL has a !1s<hex>:<hex> FTID embedded in the
  // path's "data" segment. The pair is the canonical low-level
  // identifier for the place; Google's APIs accept it as a query token.
  const m = u.pathname.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return m?.[1] ?? null;
}

function parsePlaceNameFromPath(u: URL): string | null {
  // Path looks like /maps/place/Business+Name+Inc/@27.34,-80.12,15z/data=...
  // We URL-decode the segment after /place/ and convert + to spaces.
  const m = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null;
  } catch {
    return null;
  }
}

function parseLatLng(u: URL): { lat: number; lng: number } | null {
  // Maps puts the viewport center after @ in the path, e.g. @27.34,-80.12,15z
  const m = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

async function placeDetails(placeId: string) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,businessStatus",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Places details failed: ${res.status}`);
  }
  const j = await res.json();
  if (j.businessStatus && j.businessStatus !== "OPERATIONAL") {
    // Closed places are still resolvable; we just flag it so the
    // caller can decide whether to refuse claiming a defunct listing.
  }
  return {
    place_id: j.id as string,
    name: (j.displayName?.text ?? null) as string | null,
    formatted_address: (j.formattedAddress ?? null) as string | null,
    latitude: (j.location?.latitude ?? null) as number | null,
    longitude: (j.location?.longitude ?? null) as number | null,
    business_status: (j.businessStatus ?? null) as string | null,
  };
}

async function searchByTextWithLocation(
  text: string,
  bias: { lat: number; lng: number } | null
) {
  const body: Record<string, unknown> = { textQuery: text };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        // 5km — wide enough for slight viewport-vs-pin drift, narrow
        // enough to disambiguate same-name businesses in different cities.
        radius: 5000,
      },
    };
  }
  const res = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Places text search failed: ${res.status}`);
  }
  const j = await res.json();
  const first = (j.places ?? [])[0];
  if (!first?.id) return null;
  return {
    place_id: first.id as string,
    name: (first.displayName?.text ?? null) as string | null,
    formatted_address: (first.formattedAddress ?? null) as string | null,
    latitude: (first.location?.latitude ?? null) as number | null,
    longitude: (first.location?.longitude ?? null) as number | null,
    business_status: null as string | null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    if (!PLACES_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not configured" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "url required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let raw = parsed.data.url;
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

    // Step 1: canonicalize via redirects.
    const finalUrl = await followRedirects(raw);
    console.log("[place-id-resolve] finalUrl=", finalUrl);
    let u: URL;
    try {
      u = new URL(finalUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid url after redirect resolution" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: query-param place_id (cheapest, most reliable when present).
    const queryPid = parseQueryPlaceId(u);
    if (queryPid) {
      const details = await placeDetails(queryPid);
      return new Response(JSON.stringify(details), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: FTID. Try Places Details directly (the v1 API will
    // resolve `0x...:0x...` to its canonical Place ID). Fall back to
    // a Text Search using the FTID with the lat/lng bias.
    const ftid = parseFtid(u);
    const bias = parseLatLng(u);
    const name = parsePlaceNameFromPath(u);
    console.log(
      "[place-id-resolve] ftid=",
      ftid,
      "name=",
      name,
      "bias=",
      bias
    );
    if (ftid) {
      try {
        const details = await placeDetails(ftid);
        return new Response(JSON.stringify(details), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.log("[place-id-resolve] FTID details failed:", err);
      }
      const hit = await searchByTextWithLocation(ftid, bias);
      if (hit) {
        return new Response(JSON.stringify(hit), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Step 4: business name from the path. Try with the lat/lng bias
    // first, but fall back to an unbiased global search — Maps share
    // links for service-area businesses (no fixed address) put a
    // generic regional centroid in the @lat,lng tag that often lands
    // in the ocean or a neighboring county, which kills the biased
    // query even when the business is clearly indexable by name.
    if (name) {
      for (const attempt of bias ? [bias, null] : [null]) {
        const hit = await searchByTextWithLocation(name, attempt);
        if (hit) {
          return new Response(JSON.stringify(hit), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }




    return new Response(
      JSON.stringify({
        error:
          "Could not resolve a Place ID from that link. Make sure it's a Google Maps link pointing at your business profile.",
      }),
      {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("place-id-resolve error", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
