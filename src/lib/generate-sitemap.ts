/**
 * Auto-sitemap generator (build-time, static).
 *
 * Parses `src/App.tsx` using @babel/parser, walks the AST with @babel/traverse,
 * extracts every static `<Route path="...">` value, applies exclusion rules,
 * deduplicates, fetches all PUBLISHED blog post slugs from Supabase at build
 * time, and writes `public/sitemap.xml`.
 *
 * Production source of truth: this static file is what robots.txt points at
 * (https://jointidywise.lovable.app/sitemap.xml). The /functions/v1/sitemap
 * edge function exposes the same data dynamically and is useful for ad-hoc
 * verification, but production crawlers consume this static build output.
 *
 * Invoked from vite.config.ts via `sitemapPlugin()` on `buildEnd`.
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// @babel/traverse ships as CJS; under ESM the default export lives on `.default`.
const traverse =
  ((_traverse as unknown as { default?: typeof _traverse }).default as typeof _traverse) ??
  _traverse;

const BASE_URL = "https://www.jointidywise.com";

// Exact path exclusions.
const EXCLUDED_PATHS = new Set<string>([
  "/login",
  "/signup",
  "/logout",
  "/auth",
  "/auth/callback",
  "/auth/confirm",
  "/onboarding",
  "/card-saved",
  "/delete-account",
  "*",
]);

// Prefix exclusions — any route whose path starts with one of these is skipped.
const EXCLUDED_PREFIXES = ["/dashboard", "/staff", "/portal", "/admin", "/auth", "/checkout"];

function shouldExclude(path: string): boolean {
  if (EXCLUDED_PATHS.has(path)) return true;
  if (path.includes(":")) return true; // dynamic segments
  if (path.includes("*")) return true; // wildcard / splat routes
  for (const prefix of EXCLUDED_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

async function fetchPublishedBlogSlugs(): Promise<string[]> {
  const SUPABASE_URL = "https://slwfkaqczvwvvvavkgpr.supabase.co";
  const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?select=slug&status=eq.published&limit=5000`,
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      }
    );
    if (!res.ok) {
      console.warn(`[sitemap] blog fetch failed: ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as Array<{ slug: string }>;
    return rows.map((r) => r.slug).filter(Boolean);
  } catch (err) {
    console.warn(`[sitemap] blog fetch error:`, err);
    return [];
  }
}

async function fetchScoreCompanies(): Promise<Array<{ slug: string; lastmod?: string }>> {
  const SUPABASE_URL = "https://slwfkaqczvwvvvavkgpr.supabase.co";
  const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/score_companies?select=slug,last_scored_at,updated_at&limit=5000`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    if (!res.ok) {
      console.warn(`[sitemap] score_companies fetch failed: ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as Array<{
      slug: string;
      last_scored_at: string | null;
      updated_at: string | null;
    }>;
    return rows
      .filter((r) => r.slug)
      .map((r) => ({
        slug: r.slug,
        lastmod: (r.last_scored_at ?? r.updated_at ?? undefined)?.slice(0, 10),
      }));
  } catch (err) {
    console.warn(`[sitemap] score_companies fetch error:`, err);
    return [];
  }
}

async function fetchScoreCitySlugs(): Promise<string[]> {
  const SUPABASE_URL = "https://slwfkaqczvwvvvavkgpr.supabase.co";
  const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2ZrYXFjenZ3dnZ2YXZrZ3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjk4OTQsImV4cCI6MjA4MTY0NTg5NH0.M0OhzHsrqA0oYh6Ykx_4gVK_SrdSi1V_CiFxU-n4Lec";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/score_top_cities?select=city_slug&limit=5000`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    if (!res.ok) {
      console.warn(`[sitemap] score_top_cities fetch failed: ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as Array<{ city_slug: string }>;
    return rows.map((r) => r.city_slug).filter(Boolean);
  } catch (err) {
    console.warn(`[sitemap] score_top_cities fetch error:`, err);
    return [];
  }
}

function extractRoutePaths(source: string): string[] {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const paths = new Set<string>();

  traverse(ast, {
    JSXOpeningElement(nodePath) {
      const name = nodePath.node.name;
      if (!t.isJSXIdentifier(name) || name.name !== "Route") return;

      for (const attr of nodePath.node.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name) || attr.name.name !== "path") continue;

        const value = attr.value;
        if (t.isStringLiteral(value)) {
          paths.add(value.value);
        } else if (
          t.isJSXExpressionContainer(value) &&
          t.isStringLiteral(value.expression)
        ) {
          paths.add(value.expression.value);
        }
      }
    },
  });

  return [...paths];
}

type SitemapEntry = { path: string; lastmod?: string };

function buildSitemap(entries: SitemapEntry[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...entries].sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });

  const urls = sorted
    .map((e) => {
      const p = e.path;
      const loc = p === "/" ? `${BASE_URL}/` : `${BASE_URL}${p}`;
      const priority = p === "/" ? "1.0" : "0.8";
      const changefreq = p === "/" ? "weekly" : "monthly";
      const lastmod = e.lastmod ?? today;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export async function generateSitemap(): Promise<{ count: number; outputPath: string }> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = resolve(__dirname, "..", "..");

  const appTsxPath = resolve(projectRoot, "src", "App.tsx");
  const outputPath = resolve(projectRoot, "public", "sitemap.xml");

  const source = readFileSync(appTsxPath, "utf8");
  const rawPaths = extractRoutePaths(source);
  const includedPaths = rawPaths.filter((p) => !shouldExclude(p));

  // Dedupe (HashRouter + BrowserRouter branches in App.tsx share most routes).
  const entryMap = new Map<string, SitemapEntry>();
  for (const p of includedPaths) entryMap.set(p, { path: p });

  // Add dynamic published blog post URLs from the database.
  const blogSlugs = await fetchPublishedBlogSlugs();
  for (const slug of blogSlugs) {
    const p = `/blog/post/${slug}`;
    entryMap.set(p, { path: p });
  }

  // Add concrete location pages (states + cities).
  try {
    const { locationData } = await import("../data/locationData");
    for (const slug of Object.keys(locationData)) {
      const p = `/cleaning-business-software/${slug}`;
      entryMap.set(p, { path: p });
    }
  } catch (err) {
    console.warn(`[sitemap] could not load locationData:`, err);
  }

  // Add /score/c/{slug} pages with per-row lastmod from last_scored_at.
  const scoreCompanies = await fetchScoreCompanies();
  for (const c of scoreCompanies) {
    const p = `/score/c/${c.slug}`;
    entryMap.set(p, { path: p, lastmod: c.lastmod });
  }

  // Add /score/city/{citySlug} ranking pages.
  const scoreCitySlugs = await fetchScoreCitySlugs();
  for (const slug of scoreCitySlugs) {
    const p = `/score/city/${slug}`;
    entryMap.set(p, { path: p });
  }

  const xml = buildSitemap([...entryMap.values()]);
  writeFileSync(outputPath, xml, "utf8");

  return { count: entryMap.size, outputPath };
}

// Allow direct execution: `tsx src/lib/generate-sitemap.ts`
const isDirectRun = (() => {
  try {
    return (
      process.argv[1] &&
      fileURLToPath(import.meta.url) === resolve(process.argv[1])
    );
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  generateSitemap()
    .then(({ count, outputPath }) => {
      console.log(`[sitemap] wrote ${count} urls to ${outputPath}`);
    })
    .catch((err) => {
      console.error(`[sitemap] failed:`, err);
      process.exit(1);
    });
}
