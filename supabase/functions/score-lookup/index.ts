// TidyWise Score: search/lookup endpoint
// Returns matching companies from our DB. Falls back to Google Places text search
// if no DB match, but does NOT yet score (compute happens in score-compute).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLACES_KEY =
  Deno.env.get("GOOGLE_PLACES_API_KEY") ??
  Deno.env.get("VITE_GOOGLE_PLACES_API_KEY") ??
  "";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name = "", location = "" } = await req.json().catch(() => ({}));
    const q = String(name).trim();
    const loc = String(location).trim();
    if (!q) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. DB fuzzy match
    let dbQuery = supabase
      .from("score_companies")
      .select(
        "id, slug, name, city, state, city_slug, score, score_grade, google_rating, google_review_count, claimed"
      )
      .ilike("name", `%${q}%`)
      .limit(8);
    if (loc) {
      dbQuery = dbQuery.or(`city.ilike.%${loc}%,zip.eq.${loc},state.ilike.%${loc}%`);
    }
    const { data: dbMatches } = await dbQuery;

    const out: any[] = (dbMatches ?? []).map((c) => ({ ...c, source: "db" }));

    // 2. If thin, query Google Places Text Search for additional candidates
    if (out.length < 5 && PLACES_KEY) {
      const text = loc ? `${q} cleaning ${loc}` : `${q} cleaning service`;
      const url = `https://places.googleapis.com/v1/places:searchText`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": PLACES_KEY,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.websiteUri,places.nationalPhoneNumber,places.addressComponents",
        },
        body: JSON.stringify({ textQuery: text, maxResultCount: 8 }),
      });
      if (r.ok) {
        const j = await r.json();
        for (const p of j.places ?? []) {
          const placeId = p.id;
          if (!placeId) continue;
          if (out.find((c: any) => c.google_place_id === placeId)) continue;

          // Find or create stub
          const comps = p.addressComponents ?? [];
          const cityComp = comps.find((c: any) => c.types?.includes("locality"));
          const stateComp = comps.find((c: any) =>
            c.types?.includes("administrative_area_level_1")
          );
          const city = cityComp?.shortText ?? cityComp?.longText ?? null;
          const state = stateComp?.shortText ?? null;
          const citySlug = city && state ? slugify(`${city}-${state}`) : null;
          const baseSlug = slugify(p.displayName?.text ?? "company");
          const slug = `${baseSlug}-${placeId.slice(-6).toLowerCase()}`;

          const { data: upserted } = await supabase
            .from("score_companies")
            .upsert(
              {
                slug,
                name: p.displayName?.text ?? "Unknown",
                city,
                state,
                city_slug: citySlug,
                formatted_address: p.formattedAddress ?? null,
                latitude: p.location?.latitude ?? null,
                longitude: p.location?.longitude ?? null,
                website: p.websiteUri ?? null,
                phone: p.nationalPhoneNumber ?? null,
                google_place_id: placeId,
                google_rating: p.rating ?? null,
                google_review_count: p.userRatingCount ?? 0,
                source: "google_places",
              },
              { onConflict: "google_place_id", ignoreDuplicates: false }
            )
            .select(
              "id, slug, name, city, state, city_slug, score, score_grade, google_rating, google_review_count, claimed"
            )
            .single();

          if (upserted) out.push({ ...upserted, source: "google" });
        }
      }
    }

    return new Response(JSON.stringify({ results: out.slice(0, 10) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-lookup error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
