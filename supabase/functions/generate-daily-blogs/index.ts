// generate-daily-blogs
// Phase 2 of the blog system rewrite:
// - Switched to openai/gpt-5 for stronger SEO content
// - Drafts only (status='draft'); admin must approve
// - Keyword-driven (not random topics)
// - 1500-word minimum + FAQ + structured meta
// - Duplicate slug + similar-title rejection

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIN_WORD_COUNT = 1500;
const MODEL = "openai/gpt-5";
const TITLE_SIMILARITY_THRESHOLD = 0.7; // 70%

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

// Simple Jaccard similarity on word sets
function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = new Set([...ta].filter((w) => tb.has(w)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

interface GenerateRequest {
  // Either an array of target keywords (preferred) OR count (legacy fallback)
  keywords?: string[];
  count?: number;
  category?: string;
  // If true (default), insert as draft. If false, do not insert (dry-run).
  insert?: boolean;
}

interface GeneratedBlog {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  meta_title: string;
  meta_description: string;
  secondary_keywords: string[];
  faq: Array<{ question: string; answer: string }>;
}

const SYSTEM_PROMPT = `You are a senior SEO content strategist writing for cleaning business owners on TidyWise (an all-in-one cleaning business platform).

Your writing style:
- Direct, practical, value-first (Alex Hormozi-inspired)
- Short paragraphs, scannable subheadings, real examples
- Naturally weaves in the target keyword (no stuffing)
- Never fluffy, never AI-sounding, never repetitive

Every post MUST:
- Be at least ${MIN_WORD_COUNT} words of body content
- Use proper HTML: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>
- Include an FAQ section with exactly 5 questions/answers at the end
- Have a meta_title under 60 characters and meta_description under 155 characters
- Be unique — do not reuse phrasing from prior posts

CRITICAL: Return strict JSON only. No markdown code fences. No commentary.`;

function buildUserPrompt(targetKeyword: string, category: string): string {
  return `Write a comprehensive SEO blog post targeting the keyword: "${targetKeyword}"
Category: ${category}

Return JSON with this exact shape:
{
  "title": "string (max 70 chars, include the target keyword naturally)",
  "slug": "string (lowercase, hyphenated, max 80 chars, derived from title)",
  "excerpt": "string (2 sentences, ~160 chars, hook the reader)",
  "content": "string (HTML body, MINIMUM ${MIN_WORD_COUNT} words, include 4-6 <h2> sections, bullet lists, and a strong intro and conclusion. Do NOT include the FAQ inside content — the FAQ goes in the separate faq field.)",
  "meta_title": "string (max 60 chars, include target keyword)",
  "meta_description": "string (max 155 chars, compelling search snippet)",
  "secondary_keywords": ["string", "..."] (5-8 related keywords),
  "faq": [
    { "question": "string", "answer": "string (1-3 sentences)" },
    ... exactly 5 entries
  ]
}`;
}

async function callAI(targetKeyword: string, category: string, apiKey: string): Promise<GeneratedBlog> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(targetKeyword, category) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 429) throw new Error("AI rate limit exceeded. Try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add funds to continue.");
    throw new Error(`AI gateway error ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");

  let parsed: GeneratedBlog;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Fallback: try to strip code fences
    const stripped = content.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
    parsed = JSON.parse(stripped);
  }
  return parsed;
}

async function buildFaqHtml(faq: GeneratedBlog["faq"]): Promise<string> {
  const items = (faq || [])
    .map(
      (item) =>
        `<div class="faq-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`
    )
    .join("\n");
  return `<section class="faq-section"><h2>Frequently Asked Questions</h2>${items}</section>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: GenerateRequest = await req.json().catch(() => ({}));
    const insert = body.insert !== false;
    const category = body.category || "Cleaning Business";

    // Resolve list of target keywords
    let keywords: string[] = [];
    if (Array.isArray(body.keywords) && body.keywords.length > 0) {
      keywords = body.keywords.filter((k) => typeof k === "string" && k.trim().length > 0);
    } else {
      // Legacy / cron fallback: do nothing (we no longer auto-pick random topics)
      return new Response(
        JSON.stringify({
          success: false,
          error: "No keywords provided. Pass { keywords: ['kw1', 'kw2', ...] }.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-fetch existing slugs + titles for dedup
    const { data: existing, error: existingErr } = await supabase
      .from("blog_posts")
      .select("slug, title");
    if (existingErr) throw existingErr;

    const existingSlugs = new Set((existing || []).map((p) => p.slug));
    const existingTitles = (existing || []).map((p) => p.title as string);

    const results: Array<{
      keyword: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      post_id?: string;
      title?: string;
      slug?: string;
      word_count?: number;
    }> = [];

    for (const keyword of keywords) {
      try {
        const blog = await callAI(keyword, category, LOVABLE_API_KEY);

        // Validate the AI response shape
        if (!blog.title || !blog.content || !blog.slug) {
          results.push({ keyword, status: "error", reason: "AI returned incomplete fields" });
          continue;
        }

        // Word count check
        const wordCount = countWords(blog.content);
        if (wordCount < MIN_WORD_COUNT) {
          results.push({
            keyword,
            status: "skipped",
            reason: `Word count ${wordCount} below minimum ${MIN_WORD_COUNT}`,
            word_count: wordCount,
          });
          continue;
        }

        // Slug uniqueness
        let slug = generateSlug(blog.slug || blog.title);
        if (!slug) {
          results.push({ keyword, status: "error", reason: "Could not derive slug" });
          continue;
        }
        if (existingSlugs.has(slug)) {
          results.push({
            keyword,
            status: "skipped",
            reason: `Duplicate slug: ${slug}`,
          });
          continue;
        }

        // Title similarity check
        const tooSimilar = existingTitles.find(
          (t) => titleSimilarity(t, blog.title) > TITLE_SIMILARITY_THRESHOLD
        );
        if (tooSimilar) {
          results.push({
            keyword,
            status: "skipped",
            reason: `Title too similar to existing post: "${tooSimilar}"`,
          });
          continue;
        }

        // Append FAQ HTML to content
        const faqHtml = await buildFaqHtml(blog.faq || []);
        const fullContent = `${blog.content}\n\n${faqHtml}`;
        const finalWordCount = countWords(fullContent);
        const readTime = `${Math.max(1, Math.ceil(finalWordCount / 220))} min read`;

        const insertRow = {
          slug,
          title: String(blog.title).substring(0, 200),
          excerpt: String(blog.excerpt || "").substring(0, 500),
          content: fullContent,
          category,
          read_time: readTime,
          meta_title: String(blog.meta_title || blog.title).substring(0, 60),
          meta_description: String(blog.meta_description || blog.excerpt || "").substring(0, 155),
          status: "draft",
          is_published: false, // legacy flag — keep in sync
          is_featured: false,
          target_keyword: keyword,
          secondary_keywords: Array.isArray(blog.secondary_keywords)
            ? blog.secondary_keywords.slice(0, 10)
            : [],
          word_count: finalWordCount,
          ai_model_used: MODEL,
          generation_prompt: buildUserPrompt(keyword, category),
          author: "TidyWise Team",
        };

        if (!insert) {
          results.push({
            keyword,
            status: "created",
            title: insertRow.title,
            slug,
            word_count: finalWordCount,
          });
          continue;
        }

        const { data: inserted, error: insertErr } = await supabase
          .from("blog_posts")
          .insert(insertRow)
          .select("id, title, slug")
          .single();

        if (insertErr) {
          results.push({ keyword, status: "error", reason: insertErr.message });
          continue;
        }

        // Track locally so subsequent keywords in same batch don't collide
        existingSlugs.add(slug);
        existingTitles.push(insertRow.title);

        results.push({
          keyword,
          status: "created",
          post_id: inserted.id,
          title: inserted.title,
          slug: inserted.slug,
          word_count: finalWordCount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[generate-daily-blogs] Keyword "${keyword}" failed:`, msg);
        results.push({ keyword, status: "error", reason: msg });
      }
    }

    const createdCount = results.filter((r) => r.status === "created").length;
    return new Response(
      JSON.stringify({
        success: true,
        model: MODEL,
        created: createdCount,
        total: keywords.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-daily-blogs] Fatal:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
