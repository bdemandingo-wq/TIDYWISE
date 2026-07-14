// Dynamic sitemap.xml — queries blog posts, locations, feature pages.
// Public endpoint; no auth gate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://www.jointidywise.com";

const STATIC_PATHS: { path: string; priority: number; changefreq: string }[] = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  { path: "/pricing", priority: 0.9, changefreq: "weekly" },
  { path: "/contact", priority: 0.7, changefreq: "monthly" },
  { path: "/blog", priority: 0.8, changefreq: "daily" },
  { path: "/login", priority: 0.4, changefreq: "yearly" },
  { path: "/signup", priority: 0.6, changefreq: "yearly" },
  { path: "/features/crm", priority: 0.8, changefreq: "monthly" },
  { path: "/features/route-optimization", priority: 0.8, changefreq: "monthly" },
  { path: "/features/payroll-software", priority: 0.8, changefreq: "monthly" },
  { path: "/features/scheduling", priority: 0.8, changefreq: "monthly" },
  { path: "/features/invoicing", priority: 0.8, changefreq: "monthly" },
];

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
  }[c] as string));
}

function urlNode(loc: string, lastmod?: string, changefreq?: string, priority?: number): string {
  const parts = [`    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority !== undefined) parts.push(`    <priority>${priority.toFixed(1)}</priority>`);
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const urls: string[] = [];

    // Static pages
    for (const s of STATIC_PATHS) {
      urls.push(urlNode(`${SITE_URL}${s.path}`, undefined, s.changefreq, s.priority));
    }

    // Blog posts (published only)
    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(2000);

    for (const p of posts ?? []) {
      if (!p.slug) continue;
      const lastmod = (p.updated_at || p.published_at)?.split("T")[0];
      urls.push(urlNode(`${SITE_URL}/blog/${p.slug}`, lastmod, "monthly", 0.7));
    }

    // City/location landing pages (if a `locations` table with slug exists)
    try {
      const { data: locs } = await supabase
        .from("locations")
        .select("slug, updated_at")
        .not("slug", "is", null)
        .limit(2000);
      for (const l of (locs ?? []) as Array<{ slug: string; updated_at?: string }>) {
        if (!l.slug) continue;
        const lastmod = l.updated_at?.split("T")[0];
        urls.push(urlNode(`${SITE_URL}/locations/${l.slug}`, lastmod, "monthly", 0.6));
      }
    } catch (_e) {
      // locations table may not have slug column — skip silently
    }

    // Static compare pages
    const compareCompetitors = [
      "jobber",
      "housecall-pro",
      "zenmaid",
      "booking-koala",
      "launch27",
      "servicetitan",
    ];
    for (const c of compareCompetitors) {
      urls.push(urlNode(`${SITE_URL}/compare/${c}`, undefined, "monthly", 0.8));
    }

    // Programmatic compare-by-niche pages (6 x 6 = 36)
    const compareNiches = [
      "airbnb-cleaners",
      "solo-cleaners",
      "commercial-cleaning",
      "move-out-cleaning",
      "maid-services",
      "carpet-cleaning",
    ];
    for (const c of compareCompetitors) {
      for (const n of compareNiches) {
        urls.push(urlNode(`${SITE_URL}/compare/${c}/for/${n}`, undefined, "monthly", 0.7));
      }
    }

    // Score company pages
    try {
      const { data: companies } = await supabase
        .from("score_companies")
        .select("slug, last_scored_at, updated_at")
        .not("slug", "is", null)
        .limit(5000);
      for (const c of (companies ?? []) as Array<{ slug: string; last_scored_at?: string; updated_at?: string }>) {
        if (!c.slug) continue;
        const lastmod = (c.last_scored_at || c.updated_at)?.split("T")[0];
        urls.push(urlNode(`${SITE_URL}/score/c/${c.slug}`, lastmod, "weekly", 0.6));
      }
    } catch (_e) {
      // score_companies table may not exist — skip silently
    }


    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.join("\n") +
      `\n</urlset>\n`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[sitemap] error:", err);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } },
    );
  }
});
