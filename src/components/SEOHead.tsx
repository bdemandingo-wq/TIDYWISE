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

  // Keep the static canonical tag from index.html in sync so there's exactly one in <head>,
  // even before Helmet hydrates / for non-JS crawlers.
  useEffect(() => {
    const tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (tag) tag.href = canonicalUrl;
  }, [canonicalUrl]);

  const imageUrl = ogImage
    ? ogImage.startsWith("http")
      ? ogImage
      : `${PRODUCTION_DOMAIN}${ogImage}`
    : DEFAULT_OG_IMAGE;

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

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="TidyWise" />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1920" />
      <meta property="og:image:height" content="1080" />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {/* Canonical is managed via useEffect on the static tag in index.html
          to avoid duplicate canonicals from Helmet on subpages. */}

      {/* JSON-LD */}
      {jsonLdPayload && (
        <script type="application/ld+json">{jsonLdPayload}</script>
      )}
    </Helmet>
  );
}
