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

export function Seo({ title, description, canonicalPath, noIndex, ogImage, ogType = "website", article }: SeoProps) {
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
      setMetaTag("og:image:width", "1200", true);
      setMetaTag("og:image:height", "630", true);
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
  }, [title, description, canonicalPath, noIndex, ogImage, ogType, article]);

  return null;
}
