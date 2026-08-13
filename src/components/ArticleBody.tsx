import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

/**
 * One definition of long-form body styling, for blog posts and legal pages.
 *
 * WHY THIS EXISTS. There were four different ways to render an article body and
 * 16 slightly-different `prose` class strings, none of which did anything —
 * @tailwindcss/typography was in package.json but never registered in
 * tailwind.config.ts, so every one of them compiled to nothing. Blog and legal
 * bodies rendered with zero space above headings and zero between paragraphs.
 * See docs/superpowers/plans/2026-08-13-blog-legal-vertical-rhythm.md
 *
 * Two things are deliberate:
 *
 * 1. SANITISATION LIVES HERE. The `html` path runs DOMPurify with the allowlist
 *    that previously sat inline in DynamicBlogPost. Putting it in the component
 *    means a second DB-rendered surface cannot forget it — the dangerous path is
 *    unreachable without sanitising, rather than merely documented as needing to.
 *
 * 2. THE MEASURE IS EXPLICIT. `max-w-[68ch]` replaces the `max-w-none` these
 *    containers carried, which was defeating the typography plugin's own measure.
 *    At 68ch the reading column is ~68 characters regardless of viewport, instead
 *    of the 96-109 characters measured before this change.
 */

/** Tags and attributes a blog author may emit. Intentionally narrow. */
const ALLOWED_HTML = {
  ALLOWED_TAGS: [
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
    "strong", "em", "a", "blockquote", "br", "span", "div", "code", "pre",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "id"],
  // Not `as const`: DOMPurify's Config types these as mutable string[].
};

const SIZE_CLASS = {
  sm: "prose-sm",
  base: "",
  lg: "prose-lg",
} as const;

interface ArticleBodyProps {
  /** Untrusted HTML. Sanitised here — never pass this to a raw dangerouslySetInnerHTML. */
  html?: string;
  /** Trusted JSX body. Use this OR `html`, not both. */
  children?: React.ReactNode;
  /** Type scale. `sm` suits dialogs, `lg` suits full pages. */
  size?: keyof typeof SIZE_CLASS;
  /** Escape hatch for per-page tweaks. Applied last so it can override. */
  className?: string;
}

export function ArticleBody({ html, children, size = "lg", className }: ArticleBodyProps) {
  const classes = cn(
    "prose dark:prose-invert",
    SIZE_CLASS[size],
    // The reading measure. Not max-w-none — see the note above.
    //
    // 58ch, not 65-75ch as the guidance reads. The `ch` unit is the width of the
    // "0" glyph, which is wider than an average character, so a 68ch container
    // measured 81-85 ACTUAL characters per line. 58ch lands ~70, which is the
    // number the readability guidance is actually about. Verified by measurement,
    // not assumed — see e2e/prose-rhythm.screenshots.spec.ts.
    "max-w-[58ch]",
    // Colour and weight mapped onto the design tokens, so prose defaults do not
    // fight the theme. Previously only DynamicBlogPost carried these.
    "prose-headings:font-semibold prose-headings:text-foreground",
    "prose-p:text-muted-foreground prose-p:leading-relaxed",
    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
    "prose-strong:text-foreground",
    "prose-ul:text-muted-foreground prose-ol:text-muted-foreground",
    "prose-li:text-muted-foreground prose-li:marker:text-primary",
    "prose-blockquote:text-muted-foreground prose-blockquote:border-l-primary",
    className,
  );

  if (html !== undefined) {
    return (
      <div
        className={classes}
        // Sanitised immediately above. The allowlist is the component's, not the
        // caller's, so it cannot be widened by accident at a call site.
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, ALLOWED_HTML) }}
      />
    );
  }

  return <div className={classes}>{children}</div>;
}
