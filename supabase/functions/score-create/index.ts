// TidyWise Score: create a company stub from user-submitted info.
// Used when a visitor's business isn't in Google Places (or our DB) — lets
// them generate a score without signing up for a SaaS account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(40),
  zip: z.string().trim().max(20).optional().nullable(),
  website: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  // Optional canonical Google Place ID. When set, score-compute skips
  // its name-based Places lookup (which is brittle for businesses with
  // common names, multiple locations, or no Google indexing under the
  // submitted name) and pulls reviews directly from this ID.
  google_place_id: z.string().trim().min(1).max(255).optional().nullable(),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    let { name, city, state, zip, website, phone, google_place_id } = parsed.data;

    // Light normalization
    state = state.toUpperCase().slice(0, 2);
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

    const citySlug = slugify(`${city}-${state}`);
    const baseSlug = slugify(name);
    const slug = `${baseSlug}-${randomSuffix()}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Dedupe: prefer canonical Place ID (globally unique) when one was
    // submitted, then fall back to name+city for legacy/no-place-id rows.
    if (google_place_id) {
      const { data: byPid } = await supabase
        .from("score_companies")
        .select("id, slug")
        .eq("google_place_id", google_place_id)
        .maybeSingle();
      if (byPid) {
        return new Response(
          JSON.stringify({ id: byPid.id, slug: byPid.slug, existed: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: existing } = await supabase
      .from("score_companies")
      .select("id, slug")
      .ilike("name", name)
      .eq("city_slug", citySlug)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ id: existing.id, slug: existing.slug, existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: created, error } = await supabase
      .from("score_companies")
      .insert({
        slug,
        name,
        city,
        state,
        zip: zip || null,
        city_slug: citySlug,
        website: website || null,
        phone: phone || null,
        google_place_id: google_place_id || null,
        source: google_place_id ? "user_submitted_place_id" : "user_submitted",
      })
      .select("id, slug")
      .single();

    if (error || !created) {
      throw error ?? new Error("insert failed");
    }

    return new Response(
      JSON.stringify({ id: created.id, slug: created.slug, existed: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("score-create error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
