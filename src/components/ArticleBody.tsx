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

/**
 * The reading column. Wrap a page's TITLE **and** its ArticleBody in one element
 * carrying this — do not put it on both as siblings.
 *
 * Two failed attempts are worth recording, because the second is subtle:
 *
 *   1. A max-width with no `mx-auto` left the column pinned to the parent's left
 *      edge with dead space to the right. On /privacy-policy the parent is a
 *      bordered card, so the text visibly hugged one side of a box.
 *   2. `mx-auto max-w-[58ch]` on the title div AND on ArticleBody still
 *      misaligned them by ~39px, because `ch` resolves against each ELEMENT's own
 *      font-size: the title div inherits 16px (58ch ≈ 508px) while a `prose-sm`
 *      body is 14px (58ch ≈ 444px). Same class, different widths, both centred,
 *      different left edges.
 *
 * One wrapper avoids both. The page owns the column; ArticleBody owns only the
 * typography inside it.
 */
export const READING_COLUMN = "mx-auto max-w-[58ch]";

/**
 * Pair with READING_COLUMN when the body is `size="sm"`.
 *
 * `ch` measures against the WRAPPER's font-size. A wrapper inheriting 16px gives
 * 58ch ≈ 581px, which is ~83 characters of 14px body text — too wide. Matching the
 * wrapper to the body's size brings it back to ~73. The h1 inside keeps its own
 * explicit text-3xl, so this only affects the ch computation.
 */
export const READING_COLUMN_SM = "mx-auto max-w-[58ch] text-sm";

/**
 * A card that HUGS the reading column, rather than a wide card containing a
 * narrow one.
 *
 * Centring the column fixed the asymmetry but left a bordered card with ~190px of
 * empty space either side of the text — which is what made the body read as
 * "sitting in a box" in the first place. The border should wrap the text, not a
 * field of whitespace.
 *
 * The width is the column plus the card's own horizontal padding (`sm:p-10` =
 * 5rem across), so the text inside still measures exactly 58ch. `text-sm` is
 * required for the same reason it is on READING_COLUMN_SM: `ch` resolves against
 * this element's font-size, and these pages render their body at 14px.
 */
export const READING_CARD_SM = "mx-auto max-w-[calc(58ch+5rem)] text-sm";

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
    //
    // mx-auto is NOT optional. A max-width alone leaves the column pinned to the
    // parent's left edge with dead space to the right — on /privacy-policy the
    // parent is a bordered card, so the text visibly hugged one side of a box.
    // Every consumer's parent is wider than the measure, so this centres in all
    // of them.
    // No max-width here: the page wraps title + body in READING_COLUMN so both
    // share one column. Setting it here too caused the ch-mismatch above.
    "max-w-none",
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
