/**
 * Build-time per-route static HTML generator.
 *
 * Reads dist/index.html, enumerates all known marketing routes, and emits
 * dist/<route>/index.html for each one with proper title / description /
 * canonical / og:* / twitter:* tags and an injected <h1> inside #root.
 *
 * Non-JS crawlers (Encited, Googlebot's initial fetch, ChatGPT crawler) see
 * the correct per-page tags instead of the homepage placeholder. React still
 * mounts normally over `#root` and replaces the <h1> on hydration.
 *
 * No headless browser or runtime required — just templated string emission.
 * Invoked from vite.config.ts via prerenderPlugin() on closeBundle.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATIC_ROUTE_META,
  locationRouteMeta,
  scoreCompanyRouteMeta,
  blogPostRouteMeta,
  scoreCityRouteMeta,
  type RouteMeta,
  type ScoreCompanyForMeta,
  type BlogPostForMeta,
  type ScoreCityForMeta,
} from "./routeMeta";
import { locationData } from "../data/locationData";

const SUPABASE_URL = "https://slwfkaqczvwvvvavkgpr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";

async function fetchScoreCompanies(): Promise<ScoreCompanyForMeta[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/score_companies?select=slug,name,city,state,zip,formatted_address,latitude,longitude,website,phone,score,google_rating,google_review_count&limit=5000`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) {
      console.warn(`[prerender] score_companies fetch failed: ${res.status}`);
      return [];
    }
    return (await res.json()) as ScoreCompanyForMeta[];
  } catch (err) {
    console.warn(`[prerender] score_companies fetch error:`, err);
    return [];
  }
}

async function fetchBlogPosts(): Promise<BlogPostForMeta[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?select=slug,title,meta_title,meta_description,excerpt,author,published_at,updated_at&status=eq.published&limit=5000`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) {
      console.warn(`[prerender] blog_posts fetch failed: ${res.status}`);
      return [];
    }
    return (await res.json()) as BlogPostForMeta[];
  } catch (err) {
    console.warn(`[prerender] blog_posts fetch error:`, err);
    return [];
  }
}

async function fetchScoreCities(): Promise<ScoreCityForMeta[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/score_top_cities?select=city_slug,city,state&limit=5000`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) {
      console.warn(`[prerender] score_top_cities fetch failed: ${res.status}`);
      return [];
    }
    return (await res.json()) as ScoreCityForMeta[];
  } catch (err) {
    console.warn(`[prerender] score_top_cities fetch error:`, err);
    return [];
  }
}

const BASE_URL = "https://www.jointidywise.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace tags by attribute selector. Targets the *existing* tag in
 * index.html so the order in <head> is preserved (Encited cares about order).
 */
function buildStateGridNoscript(): string {
  const items = Object.entries(locationData)
    .filter(([, loc]) => loc.type === "state")
    .map(
      ([slug, loc]) =>
        `<li><a href="/cleaning-business-software/${slug}">Cleaning business software in ${loc.name}</a></li>`
    )
    .join("");
  return `<nav aria-label="Cleaning business software by state"><ul>${items}</ul></nav>`;
}

function noscriptBodyFor(route: string, meta: RouteMeta): string | undefined {
  if (route === "/cleaning-business-software") return buildStateGridNoscript();
  return meta.noscriptBody;
}

function patchHead(html: string, route: string, meta: RouteMeta): string {
  const canonicalRoute = meta.canonicalPath ?? (route === "/" ? "/" : route);
  const canonical = `${BASE_URL}${canonicalRoute}`;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const ogImage = `${BASE_URL}/images/tidywise-og.png`;

  let out = html;

  // <title>
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);

  // <meta name="description">
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="description" content="${description}" />`
  );

  // og:title / og:description / og:url
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:title" content="${title}" />`
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:description" content="${description}" />`
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:url" content="${canonical}" />`
  );
  out = out.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta property="og:image" content="${ogImage}" />`
  );

  // twitter:title / twitter:description
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:title" content="${title}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:description" content="${description}" />`
  );
  out = out.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?\s*>/i,
    `<meta name="twitter:image" content="${ogImage}" />`
  );

  // <link rel="canonical">
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>/i,
    `<link rel="canonical" href="${canonical}" />`
  );

  // Inject <h1> inside #root so crawlers see one heading per page.
  // React's createRoot replaces the children of #root on mount, so users
  // never see this — only crawlers fetching the static HTML do.
  const h1 = `<h1 style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;">${escapeHtml(
    meta.h1
  )}</h1>`;

  // Optional <noscript> body content (internal-link grids etc). Non-JS
  // crawlers see it; users with JS never do.
  const extraBody = noscriptBodyFor(route, meta);
  const noscriptBlock = extraBody ? `<noscript>${extraBody}</noscript>` : "";

  out = out.replace(
    /<div\s+id="root"\s*>\s*<\/div>/i,
    `<div id="root">${h1}</div>${noscriptBlock}`
  );

  // Optional JSON-LD structured data, inserted before </head>.
  if (meta.jsonLd) {
    const payload = Array.isArray(meta.jsonLd)
      ? { "@context": "https://schema.org", "@graph": meta.jsonLd }
      : { "@context": "https://schema.org", ...meta.jsonLd };
    // Escape </script> sequences to avoid breaking out of the script tag.
    const json = JSON.stringify(payload).replace(/<\/script/gi, "<\\/script");
    const tag = `<script type="application/ld+json">${json}</script>`;
    out = out.replace(/<\/head>/i, `${tag}</head>`);
  }

  return out;
}

function allRoutes(
  scoreCompanies: ScoreCompanyForMeta[],
  blogPosts: BlogPostForMeta[],
  scoreCities: ScoreCityForMeta[]
): string[] {
  const routes = new Set<string>(Object.keys(STATIC_ROUTE_META));
  for (const slug of Object.keys(locationData)) {
    routes.add(`/cleaning-business-software/${slug}`);
  }
  for (const c of scoreCompanies) {
    if (c.slug) routes.add(`/score/c/${c.slug}`);
  }
  for (const p of blogPosts) {
    if (p.slug) routes.add(`/blog/post/${p.slug}`);
  }
  for (const c of scoreCities) {
    if (c.city_slug) routes.add(`/score/city/${c.city_slug}`);
  }
  return [...routes];
}

function metaFor(
  route: string,
  scoreBySlug: Map<string, ScoreCompanyForMeta>,
  blogBySlug: Map<string, BlogPostForMeta>,
  cityBySlug: Map<string, ScoreCityForMeta>
): RouteMeta {
  if (STATIC_ROUTE_META[route]) return STATIC_ROUTE_META[route];
  const locMatch = route.match(/^\/cleaning-business-software\/([a-z0-9-]+)$/);
  if (locMatch) {
    const slug = locMatch[1];
    const loc = locationData[slug];
    if (loc) return locationRouteMeta(slug, loc);
  }
  const scoreMatch = route.match(/^\/score\/c\/([a-z0-9-]+)$/i);
  if (scoreMatch) {
    const c = scoreBySlug.get(scoreMatch[1]);
    if (c) return scoreCompanyRouteMeta(c);
  }
  const blogMatch = route.match(/^\/blog\/post\/([a-z0-9-]+)$/i);
  if (blogMatch) {
    const p = blogBySlug.get(blogMatch[1]);
    if (p) return blogPostRouteMeta(p);
  }
  const cityMatch = route.match(/^\/score\/city\/([a-z0-9-]+)$/i);
  if (cityMatch) {
    const c = cityBySlug.get(cityMatch[1]);
    if (c) return scoreCityRouteMeta(c);
  }
  return STATIC_ROUTE_META["/"];
}

function routeToFile(distDir: string, route: string): string {
  if (route === "/") return join(distDir, "index.html");
  // Strip leading slash and emit <route>/index.html
  const rel = route.replace(/^\//, "");
  return join(distDir, rel, "index.html");
}

export async function prerenderRoutes(
  distDir: string
): Promise<{ written: number; skipped: number }> {
  const sourceHtmlPath = join(distDir, "index.html");
  if (!existsSync(sourceHtmlPath)) {
    throw new Error(`prerender: ${sourceHtmlPath} not found — has vite build run?`);
  }
  const sourceHtml = readFileSync(sourceHtmlPath, "utf8");

  const [scoreCompanies, blogPosts, scoreCities] = await Promise.all([
    fetchScoreCompanies(),
    fetchBlogPosts(),
    fetchScoreCities(),
  ]);
  const scoreBySlug = new Map(scoreCompanies.map((c) => [c.slug, c]));
  const blogBySlug = new Map(blogPosts.map((p) => [p.slug, p]));
  const cityBySlug = new Map(scoreCities.map((c) => [c.city_slug, c]));

  let written = 0;
  let skipped = 0;
  for (const route of allRoutes(scoreCompanies, blogPosts, scoreCities)) {
    try {
      const meta = metaFor(route, scoreBySlug, blogBySlug, cityBySlug);
      const patched = patchHead(sourceHtml, route, meta);
      const dest = routeToFile(distDir, route);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, patched);
      written++;
    } catch (e) {
      console.warn(`[prerender] skipped ${route}: ${e instanceof Error ? e.message : e}`);
      skipped++;
    }
  }
  return { written, skipped };
}

// Allow running standalone: `npx tsx src/lib/prerender-routes.ts`
const isDirectInvocation =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectInvocation) {
  const distDir = resolve(process.cwd(), "dist");
  prerenderRoutes(distDir)
    .then(({ written, skipped }) => {
      console.log(`[prerender] wrote ${written} routes, skipped ${skipped}`);
    })
    .catch((err) => {
      console.error(`[prerender] failed:`, err);
      process.exit(1);
    });
}
