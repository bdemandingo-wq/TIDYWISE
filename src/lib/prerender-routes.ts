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
import { STATIC_ROUTE_META, locationRouteMeta, type RouteMeta } from "./routeMeta";
import { locationData } from "../data/locationData";

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

  return out;
}

function allRoutes(): string[] {
  const routes = new Set<string>(Object.keys(STATIC_ROUTE_META));
  for (const slug of Object.keys(locationData)) {
    routes.add(`/cleaning-business-software/${slug}`);
  }
  return [...routes];
}

function metaFor(route: string): RouteMeta {
  if (STATIC_ROUTE_META[route]) return STATIC_ROUTE_META[route];
  const locMatch = route.match(/^\/cleaning-business-software\/([a-z0-9-]+)$/);
  if (locMatch) {
    const slug = locMatch[1];
    const loc = locationData[slug];
    if (loc) return locationRouteMeta(slug, loc);
  }
  return STATIC_ROUTE_META["/"];
}

function routeToFile(distDir: string, route: string): string {
  if (route === "/") return join(distDir, "index.html");
  // Strip leading slash and emit <route>/index.html
  const rel = route.replace(/^\//, "");
  return join(distDir, rel, "index.html");
}

export function prerenderRoutes(distDir: string): { written: number; skipped: number } {
  const sourceHtmlPath = join(distDir, "index.html");
  if (!existsSync(sourceHtmlPath)) {
    throw new Error(`prerender: ${sourceHtmlPath} not found — has vite build run?`);
  }
  const sourceHtml = readFileSync(sourceHtmlPath, "utf8");

  let written = 0;
  let skipped = 0;
  for (const route of allRoutes()) {
    try {
      const meta = metaFor(route);
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
  const { written, skipped } = prerenderRoutes(distDir);
  console.log(`[prerender] wrote ${written} routes, skipped ${skipped}`);
}
