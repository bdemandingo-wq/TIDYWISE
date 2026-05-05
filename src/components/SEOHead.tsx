import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

const PRODUCTION_DOMAIN = "https://www.jointidywise.com";
const DEFAULT_OG_IMAGE = `${PRODUCTION_DOMAIN}/images/tidywise-og.png`;

type SEOHeadProps = {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  noIndex?: boolean;
  schemaJson?: Record<string, unknown> | Record<string, unknown>[];
};

export function SEOHead({
  title,
  description,
  canonical,
  ogImage,
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
  useEffect(() => {
    const setLinkHref = (selector: string, href: string) => {
      const tag = document.querySelector<HTMLLinkElement>(selector);
      if (tag) tag.href = href;
    };
    const setMetaContent = (selector: string, content: string) => {
      const tag = document.querySelector<HTMLMetaElement>(selector);
      if (tag) tag.content = content;
    };

    setLinkHref('link[rel="canonical"]', canonicalUrl);

    // Sync the static description meta in index.html so non-JS crawlers and
    // SEO scorers that read the initial HTML see the correct, per-route copy.
    setMetaContent('meta[name="description"]', description);

    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:image"]', imageUrl);
    setMetaContent('meta[property="og:url"]', canonicalUrl);

    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
    setMetaContent('meta[name="twitter:image"]', imageUrl);
  }, [canonicalUrl, title, description, imageUrl]);

  const jsonLdPayload = schemaJson
    ? Array.isArray(schemaJson)
      ? JSON.stringify({ "@context": "https://schema.org", "@graph": schemaJson })
      : JSON.stringify({ "@context": "https://schema.org", ...schemaJson })
    : undefined;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow"} />

      {/* Canonical and OG/Twitter tags are managed via useEffect on the static tags
          in index.html to keep them at the top of <head> and avoid duplicates. */}

      {/* JSON-LD */}
      {jsonLdPayload && (
        <script type="application/ld+json">{jsonLdPayload}</script>
      )}
    </Helmet>
  );
}
