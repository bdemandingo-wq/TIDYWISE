// Dynamic sitemap.xml served from the database.
// Combines static marketing routes + all published blog posts.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DOMAIN = "https://www.jointidywise.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UrlEntry {
  loc: string;
  lastmod: string; // YYYY-MM-DD
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
}

const STATIC_ROUTES: UrlEntry[] = [
  { loc: "/", lastmod: "", changefreq: "weekly", priority: "1.0" },
  { loc: "/pricing", lastmod: "", changefreq: "weekly", priority: "0.9" },
  { loc: "/demo", lastmod: "", changefreq: "weekly", priority: "0.9" },
  { loc: "/blog", lastmod: "", changefreq: "daily", priority: "0.8" },
  { loc: "/cleaning-business-software", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/privacy-policy", lastmod: "", changefreq: "yearly", priority: "0.3" },
  // Cornerstone blog posts (static React pages)
  { loc: "/blog/crm-for-cleaning-business", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/how-to-start-a-cleaning-business", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/booking-koala-vs-jobber-vs-tidywise", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/how-to-grow-cleaning-business-2025", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/best-software-for-cleaning-business", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/how-to-automate-cleaning-company", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/payroll-software-for-cleaning-businesses", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/gps-tracking-cleaning-business", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/scheduling-software-for-cleaning-business", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/invoicing-software-for-cleaning-business", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/maid-service-software", lastmod: "", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog/cleaning-business-management-software", lastmod: "", changefreq: "monthly", priority: "0.8" },
  // Comparison pages
  { loc: "/compare/jobber", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare/booking-koala", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare/housecall-pro", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare/zenmaid", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/compare/servicetitan", lastmod: "", changefreq: "monthly", priority: "0.7" },
  // Feature pages
  { loc: "/features/automated-dispatching", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/quote-software", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/sms-notifications", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/payment-processing", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/route-optimization", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/invoicing-software", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/scheduling-software", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/booking", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/crm", lastmod: "", changefreq: "monthly", priority: "0.7" },
  { loc: "/features/payroll-software", lastmod: "", changefreq: "monthly", priority: "0.7" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = formatDate(new Date());

    // Fetch published posts only
    const { data: posts, error } = await supabase
      .from("blog_posts")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const dynamicEntries: UrlEntry[] = (posts || []).map((p) => ({
      loc: `/blog/post/${p.slug}`,
      lastmod: formatDate(new Date(p.updated_at || p.published_at || today)),
      changefreq: "monthly",
      priority: "0.6",
    }));

    const allEntries = [
      ...STATIC_ROUTES.map((r) => ({ ...r, lastmod: r.lastmod || today })),
      ...dynamicEntries,
    ];

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      allEntries
        .map(
          (e) =>
            `  <url>\n` +
            `    <loc>${escapeXml(DOMAIN + e.loc)}</loc>\n` +
            `    <lastmod>${e.lastmod}</lastmod>\n` +
            `    <changefreq>${e.changefreq}</changefreq>\n` +
            `    <priority>${e.priority}</priority>\n` +
            `  </url>`
        )
        .join("\n") +
      `\n</urlset>\n`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[sitemap] error:", msg);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<error>${escapeXml(msg)}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml" } }
    );
  }
});
