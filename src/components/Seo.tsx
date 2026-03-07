import { useEffect } from "react";

// Production domain for canonical URLs
const PRODUCTION_DOMAIN = "https://www.jointidywise.com";

type SeoProps = {
  title: string;
  description?: string;
  canonicalPath?: string;
  noIndex?: boolean;
  ogImage?: string;
  ogType?: "website" | "article";
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    section?: string;
  };
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

function setMetaTag(property: string, content: string, isProperty = false) {
  const attr = isProperty ? "property" : "name";
  let meta = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, property);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

const JSON_LD_ID = "seo-json-ld";

export function Seo({ title, description, canonicalPath, noIndex, ogImage, ogType = "website", article, jsonLd }: SeoProps) {
  useEffect(() => {
    document.title = title;

    if (description) {
      setMetaTag("description", description);
    }

    // Open Graph tags
    setMetaTag("og:title", title, true);
    if (description) setMetaTag("og:description", description, true);
    setMetaTag("og:type", ogType, true);
    setMetaTag("og:site_name", "TidyWise", true);
    
    if (canonicalPath) {
      const href = `${PRODUCTION_DOMAIN}${canonicalPath}`;
      setMetaTag("og:url", href, true);
      
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = href;
    }

    if (ogImage) {
      const imageUrl = ogImage.startsWith("http") ? ogImage : `${PRODUCTION_DOMAIN}${ogImage}`;
      setMetaTag("og:image", imageUrl, true);
      setMetaTag("og:image:width", "1920", true);
      setMetaTag("og:image:height", "1080", true);
      setMetaTag("og:image:type", "image/png", true);
      // Twitter
      setMetaTag("twitter:card", "summary_large_image");
      setMetaTag("twitter:image", imageUrl);
    }

    setMetaTag("twitter:title", title);
    if (description) setMetaTag("twitter:description", description);

    // Article-specific meta
    if (article?.publishedTime) setMetaTag("article:published_time", article.publishedTime, true);
    if (article?.modifiedTime) setMetaTag("article:modified_time", article.modifiedTime, true);
    if (article?.section) setMetaTag("article:section", article.section, true);

    // Handle noindex
    if (noIndex !== undefined) {
      setMetaTag("robots", noIndex ? "noindex, nofollow" : "index, follow");
    }

    // JSON-LD structured data
    const prev = document.getElementById(JSON_LD_ID);
    if (prev) prev.remove();

    if (jsonLd) {
      const script = document.createElement("script");
      script.id = JSON_LD_ID;
      script.type = "application/ld+json";
      const payload = Array.isArray(jsonLd)
        ? { "@context": "https://schema.org", "@graph": jsonLd }
        : { "@context": "https://schema.org", ...jsonLd };
      script.textContent = JSON.stringify(payload);
      document.head.appendChild(script);
    }

    return () => {
      const el = document.getElementById(JSON_LD_ID);
      if (el) el.remove();
    };
  }, [title, description, canonicalPath, noIndex, ogImage, ogType, article, jsonLd]);

  return null;
}
