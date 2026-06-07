import { useLayoutEffect, useEffect } from "react";
import { Helmet } from "react-helmet-async";

// useLayoutEffect runs synchronously after DOM mutations but before paint, so
// the per-route head tags are set before any prerender snapshot captures the
// page. Falls back to useEffect during SSR (where useLayoutEffect warns).
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const PRODUCTION_DOMAIN = "https://www.jointidywise.com";
const DEFAULT_OG_IMAGE = `${PRODUCTION_DOMAIN}/images/tidywise-og.png`;

type SEOHeadProps = {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  noIndex?: boolean;
  schemaJson?: Record<string, unknown> | Record<string, unknown>[];
};

export function SEOHead({
  title,
  description,
  canonical,
  ogImage,
  ogType = "website",
  noIndex = false,
  schemaJson,
}: SEOHeadProps) {
  // Derive canonical: explicit prop wins; otherwise use the current pathname
  // so every page emits a self-referencing canonical on the preferred (www) domain.
  const pathFromBrowser =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
  const canonicalSource = canonical ?? pathFromBrowser;
  const canonicalUrl = canonicalSource.startsWith("http")
    ? canonicalSource
    : `${PRODUCTION_DOMAIN}${canonicalSource.startsWith("/") ? canonicalSource : `/${canonicalSource}`}`;

  const imageUrl = ogImage
    ? ogImage.startsWith("http")
      ? ogImage
      : `${PRODUCTION_DOMAIN}${ogImage}`
    : DEFAULT_OG_IMAGE;

  // Keep the static canonical and OG/Twitter tags from index.html in sync so there's
  // exactly one of each in <head>, even before Helmet hydrates / for non-JS crawlers.
  // Using a layout effect so the update happens before paint — important for
  // prerender snapshots that capture the DOM at first paint.
  useIsoLayoutEffect(() => {
    const setLinkHref = (selector: string, href: string) => {
      const tag = document.querySelector<HTMLLinkElement>(selector);
      if (tag) tag.href = href;
    };
    const setMetaContent = (selector: string, content: string) => {
      const tag = document.querySelector<HTMLMetaElement>(selector);
      if (tag) tag.content = content;
    };

    setLinkHref('link[rel="canonical"]', canonicalUrl);

    // Update the static <title> in index.html (also updates the browser tab).
    if (typeof document !== "undefined") {
      document.title = title;
    }

    // Sync the static description meta in index.html so non-JS crawlers and
    // SEO scorers that read the initial HTML see the correct, per-route copy.
    setMetaContent('meta[name="description"]', description);

    setMetaContent(
      'meta[name="robots"]',
      noIndex ? "noindex, nofollow" : "index, follow"
    );

    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:image"]', imageUrl);
    setMetaContent('meta[property="og:url"]', canonicalUrl);

    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
    setMetaContent('meta[name="twitter:image"]', imageUrl);
  }, [canonicalUrl, title, description, imageUrl, noIndex]);

  const jsonLdPayload = schemaJson
    ? Array.isArray(schemaJson)
      ? JSON.stringify({ "@context": "https://schema.org", "@graph": schemaJson })
      : JSON.stringify({ "@context": "https://schema.org", ...schemaJson })
    : undefined;

  // All conventional head tags (title, description, robots, canonical, OG,
  // Twitter) are managed by the useEffect above — it mutates the existing
  // static tags from index.html in place. Helmet is used only for JSON-LD
  // because there's no static schema tag to update.
  return (
    <Helmet>
      {jsonLdPayload && (
        <script type="application/ld+json">{jsonLdPayload}</script>
      )}
    </Helmet>
  );
}
