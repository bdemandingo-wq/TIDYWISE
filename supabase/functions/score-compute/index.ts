// TidyWise Score: compute or refresh a company's score
// Pulls Google reviews via Places, runs AI sentiment on review text,
// pings the website for basic quality signals, and writes everything to DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { generateObject } from "npm:ai@5";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";

const gateway = createOpenAICompatible({
  name: "lovable",
  baseURL: "https://ai.gateway.lovable.dev/v1",
  headers: {
    "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY") ?? "",
    "X-Lovable-AIG-SDK": "vercel-ai-sdk",
  },
});

function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function reviewsScore(rating: number | null, count: number, mostRecentDays: number | null) {
  if (!rating || !count) return 30;
  const ratingPart = Math.min(50, ((rating - 3) / 2) * 50); // 3.0=0, 5.0=50
  const volumePart = Math.min(30, Math.log10(count + 1) * 18);
  const recencyPart =
    mostRecentDays === null ? 10 : Math.max(0, 20 - mostRecentDays / 9); // ~180d → 0
  return Math.round(Math.max(0, Math.min(100, ratingPart + volumePart + recencyPart)));
}

async function checkWebsite(url: string | null) {
  if (!url) {
    return {
      website_score: 20,
      website_has_https: false,
      website_mobile_friendly: false,
      website_has_booking: false,
      website_load_ms: null as number | null,
    };
  }
  let score = 0;
  const has_https = url.startsWith("https://");
  if (has_https) score += 25;
  let mobile = false;
  let booking = false;
  let loadMs: number | null = null;
  try {
    const start = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    loadMs = Date.now() - start;
    if (res.ok) {
      score += 20;
      const html = (await res.text()).toLowerCase();
      mobile = /viewport[^>]*width=device-width/.test(html);
      if (mobile) score += 25;
      booking = /(book\s+now|book\s+online|schedule\s+(a\s+)?clean|get\s+a\s+quote|instant\s+quote)/.test(
        html
      );
      if (booking) score += 20;
      if (loadMs < 1500) score += 10;
      else if (loadMs < 3500) score += 5;
    }
  } catch (_e) {
    // unreachable
  }
  return {
    website_score: Math.min(100, score),
    website_has_https: has_https,
    website_mobile_friendly: mobile,
    website_has_booking: booking,
    website_load_ms: loadMs,
  };
}

const InsightsSchema = z.object({
  reliability: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  quality: z.number().min(0).max(100),
  value: z.number().min(0).max(100),
  themes: z.array(z.object({ label: z.string(), sentiment: z.enum(["positive", "neutral", "negative"]) })).max(8),
  tips: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        impact: z.enum(["high", "medium", "low"]),
      })
    )
    .min(3)
    .max(8),
});

async function aiAnalyze(opts: {
  name: string;
  rating: number | null;
  count: number;
  reviews: string[];
  website: { website_score: number; website_has_https: boolean; website_mobile_friendly: boolean; website_has_booking: boolean };
  reviewsScore: number;
}) {
  const reviewBlock = opts.reviews.slice(0, 25).map((r, i) => `${i + 1}. ${r}`).join("\n").slice(0, 8000);
  const prompt = `You are analyzing a US cleaning company's online reputation to produce a "TidyWise Score" report.

Company: ${opts.name}
Google rating: ${opts.rating ?? "n/a"} (${opts.count} reviews)
Reviews score (0-100): ${opts.reviewsScore}
Website signals: https=${opts.website.website_has_https}, mobile=${opts.website.website_mobile_friendly}, booking=${opts.website.website_has_booking}, score=${opts.website.website_score}

Recent reviews:
${reviewBlock || "(no review text available)"}

Tasks:
1. Score 0-100 four sub-dimensions from the review text (or use 60 default if no reviews): reliability, communication, quality, value.
2. Extract up to 6 review themes (short labels, 1-3 words each) with sentiment.
3. Generate 5-8 *specific*, *actionable* improvement tips this owner could do this week. Reference their actual weak signals (low recency, missing booking flow, value complaints, etc.). Keep each tip body under 240 chars. Tips should never be generic.`;

  const { object } = await generateObject({
    model: gateway("google/gemini-3-flash-preview"),
    prompt,
    schema: InsightsSchema,
  });
  return object;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { company_id, force = false } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: company, error: cErr } = await supabase
      .from("score_companies")
      .select("*")
      .eq("id", company_id)
      .single();
    if (cErr || !company) throw new Error(cErr?.message ?? "company not found");

    // Cached recently (< 7 days)?
    if (
      !force &&
      company.last_scored_at &&
      Date.now() - new Date(company.last_scored_at).getTime() < 7 * 24 * 3600 * 1000
    ) {
      const { data: m } = await supabase
        .from("score_company_metrics")
        .select("*")
        .eq("company_id", company_id)
        .maybeSingle();
      return new Response(JSON.stringify({ company, metrics: m, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch fresh Google details + reviews
    let rating = company.google_rating;
    let count = company.google_review_count ?? 0;
    let reviews: string[] = [];
    let mostRecentDays: number | null = null;
    let placeId: string | null = company.google_place_id ?? null;
    let resolvedWebsite: string | null = company.website ?? null;
    let resolvedPhone: string | null = company.phone ?? null;

    // For user-submitted businesses we may not have a google_place_id yet —
    // do a one-shot Places Text Search to find one before pulling details.
    if (PLACES_KEY && !placeId) {
      const text = [company.name, company.city, company.state].filter(Boolean).join(" ");
      try {
        const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": PLACES_KEY,
            "X-Goog-FieldMask": "places.id",
          },
          body: JSON.stringify({ textQuery: text, maxResultCount: 1 }),
        });
        if (r.ok) {
          const j = await r.json();
          placeId = j.places?.[0]?.id ?? null;
        }
      } catch (e) {
        console.warn("places text search failed", e);
      }
    }

    if (PLACES_KEY && placeId) {
      const r = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          headers: {
            "X-Goog-Api-Key": PLACES_KEY,
            "X-Goog-FieldMask":
              "id,displayName,rating,userRatingCount,reviews,websiteUri,nationalPhoneNumber",
          },
        }
      );
      if (r.ok) {
        const j = await r.json();
        rating = j.rating ?? rating;
        count = j.userRatingCount ?? count;
        if (!resolvedWebsite && j.websiteUri) resolvedWebsite = j.websiteUri;
        if (!resolvedPhone && j.nationalPhoneNumber) resolvedPhone = j.nationalPhoneNumber;
        const rs = j.reviews ?? [];
        reviews = rs.map((x: any) => x.text?.text ?? x.originalText?.text ?? "").filter(Boolean);
        const newest = rs[0]?.publishTime;
        if (newest) {
          mostRecentDays = Math.floor((Date.now() - new Date(newest).getTime()) / (24 * 3600 * 1000));
        }
      }
    }

    const reviewsScoreVal = reviewsScore(rating, count, mostRecentDays);
    const web = await checkWebsite(resolvedWebsite);

    // AI is best-effort. If it fails (missing key, bad model, schema mismatch),
    // we still save a partial score from reviews + website so the page isn't blank.
    let ai: {
      reliability: number;
      communication: number;
      quality: number;
      value: number;
      themes: { label: string; sentiment: "positive" | "neutral" | "negative" }[];
      tips: { title: string; body: string; impact: "high" | "medium" | "low" }[];
    };
    let aiFailed = false;
    try {
      ai = await aiAnalyze({
        name: company.name,
        rating,
        count,
        reviews,
        website: web,
        reviewsScore: reviewsScoreVal,
      });
    } catch (e) {
      console.error("aiAnalyze failed, using fallback", e);
      aiFailed = true;
      ai = {
        reliability: 60,
        communication: 60,
        quality: 60,
        value: 60,
        themes: [],
        tips: [],
      };
    }

    const sentimentAvg = (ai.reliability + ai.communication + ai.quality + ai.value) / 4;
    const total = Math.round(
      reviewsScoreVal * 0.45 + sentimentAvg * 0.3 + web.website_score * 0.25
    );
    const grade = letterGrade(total);

    const companyUpdate: Record<string, any> = {
      google_rating: rating,
      google_review_count: count,
      score: total,
      score_grade: grade,
      last_scored_at: new Date().toISOString(),
    };
    if (placeId && placeId !== company.google_place_id) companyUpdate.google_place_id = placeId;
    if (resolvedWebsite && resolvedWebsite !== company.website) companyUpdate.website = resolvedWebsite;
    if (resolvedPhone && resolvedPhone !== company.phone) companyUpdate.phone = resolvedPhone;

    await supabase
      .from("score_companies")
      .update(companyUpdate)
      .eq("id", company_id);

    await supabase.from("score_company_metrics").upsert(
      {
        company_id,
        reviews_score: reviewsScoreVal,
        sentiment_reliability: ai.reliability,
        sentiment_communication: ai.communication,
        sentiment_quality: ai.quality,
        sentiment_value: ai.value,
        website_score: web.website_score,
        website_has_https: web.website_has_https,
        website_mobile_friendly: web.website_mobile_friendly,
        website_has_booking: web.website_has_booking,
        website_load_ms: web.website_load_ms,
        review_themes: ai.themes,
        ai_tips: ai.tips,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

    // Recompute city rank
    if (company.city_slug) {
      const { data: peers } = await supabase
        .from("score_companies")
        .select("id, score")
        .eq("city_slug", company.city_slug)
        .not("score", "is", null)
        .order("score", { ascending: false });
      const rank = (peers ?? []).findIndex((p: any) => p.id === company_id) + 1;
      await supabase
        .from("score_companies")
        .update({ city_rank: rank || null, city_total: peers?.length ?? null })
        .eq("id", company_id);
    }

    const { data: refreshed } = await supabase
      .from("score_companies")
      .select("*")
      .eq("id", company_id)
      .single();
    const { data: metrics } = await supabase
      .from("score_company_metrics")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ company: refreshed, metrics, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("score-compute error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
