// generate-daily-blogs
// Phase 3: queue-driven, single-post-per-invocation, draft-only with quality scoring.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_WORD_COUNT = 1500;
const MODEL = "openai/gpt-5";
const TITLE_SIMILARITY_THRESHOLD = 0.85;
const COMPETITORS = ["Jobber", "Housecall Pro", "ZenMaid", "Launch27", "ServiceM8", "BookingKoala", "HubSpot"];
const FAILURE_ALERT_EMAIL = "support@tidywisecleaning.com";
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80";

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
}
function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}
function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a); const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = new Set([...ta].filter((w) => tb.has(w)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}
function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}
function countCompetitorMentions(html: string): number {
  const lower = html.toLowerCase();
  return COMPETITORS.filter((c) => lower.includes(c.toLowerCase())).length;
}
function calcQualityScore(o: { wordCount: number; hasFaq: boolean; competitorCount: number; hasH2: boolean; hasH3: boolean; hasMeta: boolean }): { score: number; notes: string[] } {
  const notes: string[] = []; let score = 0;
  if (o.wordCount >= 2500) { score += 30; notes.push("Words 30/30"); }
  else if (o.wordCount >= 1500) { score += 22; notes.push("Words 22/30"); }
  else if (o.wordCount >= 1000) { score += 12; notes.push(`Words low ${o.wordCount} 12/30`); }
  else notes.push(`Words too low ${o.wordCount} 0/30`);
  if (o.hasFaq) { score += 15; notes.push("FAQ 15/15"); } else notes.push("FAQ missing 0/15");
  if (o.competitorCount >= 5) { score += 25; notes.push(`Competitors ${o.competitorCount} 25/25`); }
  else if (o.competitorCount >= 3) { score += 18; notes.push(`Competitors ${o.competitorCount} 18/25`); }
  else if (o.competitorCount >= 1) { score += 8; notes.push(`Competitors ${o.competitorCount} 8/25`); }
  else notes.push("Competitors 0/25");
  if (o.hasH2 && o.hasH3) { score += 20; notes.push("Structure 20/20"); }
  else if (o.hasH2) { score += 10; notes.push("Structure 10/20"); }
  else notes.push("Structure 0/20");
  if (o.hasMeta) { score += 10; notes.push("Meta 10/10"); } else notes.push("Meta 0/10");
  return { score: Math.min(100, score), notes };
}

interface GeneratedBlog {
  title: string; slug: string; excerpt: string; content: string;
  meta_title: string; meta_description: string; secondary_keywords: string[];
  faq: Array<{ question: string; answer: string }>;
}

const SYSTEM_PROMPT = `You are a senior SEO content strategist writing for cleaning business OWNERS on TidyWise (an all-in-one cleaning business platform).

Audience: people running cleaning companies (1-50 employees) — NOT homeowners.
Voice: founder-to-founder, B2B, direct, value-first. Short paragraphs, real numbers.

Every post MUST:
- Be at least ${MIN_WORD_COUNT} words of body content
- Use proper HTML: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>
- Open with an H2 intro (no H1 — title is rendered separately)
- Include 5+ body H2 sections, each with at least one H3
- Include an FAQ section near the end (use <h2>Frequently Asked Questions</h2>) with EXACTLY 5 Q&As
- End with a conclusion that includes a soft CTA mentioning TidyWise naturally
- Mention at least 3 of these competitors by name where relevant: ${COMPETITORS.join(", ")}
- Position TidyWise honestly — never spammy. Acknowledge competitor strengths.
- meta_title under 60 chars, meta_description under 155 chars
- Be unique — do not reuse phrasing

CRITICAL: Return strict JSON only. No markdown fences. No commentary.`;

function buildUserPrompt(targetKeyword: string, intent: string | null): string {
  const note = intent === "bottom_funnel" ? "High-commercial intent. Lean into product comparison and decision criteria."
    : intent === "middle_funnel" ? "Middle-funnel research. Focus on actionable how-to with software/tool recommendations."
    : "Top-funnel awareness. Educate first, mention tools naturally.";
  return `Write a comprehensive SEO blog post targeting: "${targetKeyword}"
Intent: ${intent || "general"}. ${note}

Return JSON with this exact shape:
{"title":"string max 70 chars","slug":"string lowercase-hyphenated","excerpt":"string max 200 chars","content":"HTML body ${MIN_WORD_COUNT}+ words","meta_title":"string max 60","meta_description":"string max 155","secondary_keywords":["string"],"faq":[{"question":"string","answer":"string"}]}`;
}

async function callLovableAI(systemPrompt: string, userPrompt: string): Promise<GeneratedBlog> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" } }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit on AI gateway");
    if (res.status === 402) throw new Error("AI gateway credits exhausted");
    throw new Error(`AI gateway ${res.status}: ${text.substring(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");
  return JSON.parse(content) as GeneratedBlog;
}

async function fetchUnsplashImage(keyword: string): Promise<string> {
  const accessKey = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!accessKey) { console.log("UNSPLASH_ACCESS_KEY not set — using fallback"); return FALLBACK_IMAGE; }
  const query = keyword.toLowerCase().replace(/\b(what|is|the|best|how|do|i|for|a|an|my|to)\b/g, "").replace(/\s+/g, " ").trim() || "cleaning business";
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${accessKey}` } });
    if (!res.ok) return FALLBACK_IMAGE;
    const data = await res.json();
    return data?.results?.[0]?.urls?.regular || FALLBACK_IMAGE;
  } catch (e) { console.error("Unsplash failed:", e); return FALLBACK_IMAGE; }
}

async function sendFailureAlert(errors: string[]) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) { console.warn("RESEND_API_KEY not set — cannot send alert"); return; }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "TidyWise Blog Bot <noreply@jointidywise.com>",
        to: [FAILURE_ALERT_EMAIL],
        subject: "🚨 Blog generation — 3 consecutive failures",
        html: `<h2>Blog generation needs attention</h2><p>3 consecutive failures detected.</p><h3>Recent errors:</h3><ul>${errors.map((e) => `<li><code>${e}</code></li>`).join("")}</ul><p>Review at <a href="https://jointidywise.com/admin/blog/keywords">/admin/blog/keywords</a>.</p>`,
      }),
    });
  } catch (e) { console.error("Alert failed:", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Cron auth gate
  const cronGate = requireCronSecret(req);
  if (cronGate) return cronGate;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: nextKeywords, error: qErr } = await supabase
      .from("blog_keyword_queue").select("*").eq("status", "queued")
      .order("priority", { ascending: true }).order("created_at", { ascending: true }).limit(1);
    if (qErr) throw qErr;
    if (!nextKeywords || nextKeywords.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Queue empty" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const queueRow = nextKeywords[0];

    await supabase.from("blog_keyword_queue")
      .update({ status: "in_progress", last_attempted_at: new Date().toISOString() })
      .eq("id", queueRow.id);

    let post: GeneratedBlog;
    try {
      post = await callLovableAI(SYSTEM_PROMPT, buildUserPrompt(queueRow.keyword, queueRow.intent));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("blog_keyword_queue")
        .update({ status: "failed", error_message: msg, attempts: queueRow.attempts + 1 })
        .eq("id", queueRow.id);
      const { data: recentFailures } = await supabase.from("blog_keyword_queue")
        .select("error_message").eq("status", "failed")
        .order("last_attempted_at", { ascending: false }).limit(3);
      if (recentFailures && recentFailures.length >= 3) {
        await sendFailureAlert(recentFailures.map((r) => r.error_message || "Unknown"));
      }
      throw e;
    }

    const wordCount = countWords(post.content);
    const competitorCount = countCompetitorMentions(post.content);
    const hasFaq = /frequently asked|<h2[^>]*>\s*faq/i.test(post.content);
    const hasH2 = /<h2/i.test(post.content);
    const hasH3 = /<h3/i.test(post.content);
    const hasMeta = !!(post.meta_title && post.meta_description);

    const { data: existing } = await supabase.from("blog_posts")
      .select("title, slug").in("status", ["published", "draft"]).limit(500);
    const similar = (existing || []).find((p) => titleSimilarity(p.title, post.title) >= TITLE_SIMILARITY_THRESHOLD);
    let slug = post.slug ? generateSlug(post.slug) : generateSlug(post.title);
    const { data: slugClash } = await supabase.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
    if (slugClash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const { score, notes } = calcQualityScore({ wordCount, hasFaq, competitorCount, hasH2, hasH3, hasMeta });
    const validationNotes: string[] = [...notes];
    if (similar) validationNotes.push(`⚠️ Similar to: "${similar.title}"`);

    const featured_image_url = await fetchUnsplashImage(queueRow.keyword);

    let finalContent = post.content;
    if (post.faq && post.faq.length > 0 && !/itemtype="https:\/\/schema\.org\/FAQPage"/.test(finalContent)) {
      const faqJsonLd = {
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: post.faq.map((q) => ({
          "@type": "Question", name: q.question,
          acceptedAnswer: { "@type": "Answer", text: q.answer },
        })),
      };
      finalContent += `\n<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>`;
    }

    const { data: inserted, error: insErr } = await supabase.from("blog_posts").insert({
      title: post.title, slug, excerpt: post.excerpt, content: finalContent,
      meta_title: post.meta_title, meta_description: post.meta_description,
      target_keyword: queueRow.keyword, secondary_keywords: post.secondary_keywords || [],
      word_count: wordCount, ai_model_used: MODEL, featured_image_url,
      category: "Cleaning Business", author: "TidyWise Team",
      status: "draft", is_published: false,
      quality_score: score, quality_notes: validationNotes.join(" • "),
    }).select("id, slug, title").single();

    if (insErr) {
      await supabase.from("blog_keyword_queue")
        .update({ status: "failed", error_message: insErr.message, attempts: queueRow.attempts + 1 })
        .eq("id", queueRow.id);
      throw insErr;
    }

    await supabase.from("blog_keyword_queue")
      .update({ status: "completed", generated_post_id: inserted.id, error_message: null })
      .eq("id", queueRow.id);

    return new Response(
      JSON.stringify({ ok: true, post: inserted, keyword: queueRow.keyword, quality_score: score, word_count: wordCount, competitor_mentions: competitorCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-daily-blogs error:", e);
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
