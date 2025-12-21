import { useEffect } from "react";

type SeoProps = {
  title: string;
  description?: string;
  canonicalPath?: string;
};

export function Seo({ title, description, canonicalPath }: SeoProps) {
  useEffect(() => {
    document.title = title;

    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = description;
    }

    if (canonicalPath) {
      const href = `${window.location.origin}${canonicalPath}`;
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = href;
    }
  }, [title, description, canonicalPath]);

  return null;
}
