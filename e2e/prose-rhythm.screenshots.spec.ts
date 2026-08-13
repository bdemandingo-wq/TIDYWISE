// Before/after visual capture for the blog + legal vertical-rhythm work.
//
// This is a CAPTURE TOOL, not an assertion suite. It asserts almost nothing on
// purpose: whether the rhythm reads well is a judgement call for a person
// looking at the images, and a green tick would not answer it. What it does add
// is numbers alongside the pictures — computed font sizes, the gap above each
// heading, and the measured column width — because "looks tighter" is not
// something either of us should be eyeballing from a screenshot alone.
//
// Kept out of the default run by the `screenshots` project in
// playwright.config.ts. Run it explicitly, twice:
//
//   PROSE_PHASE=before npx playwright test --project=screenshots
//   ...make the changes...
//   PROSE_PHASE=after  npx playwright test --project=screenshots
//
// Output: screenshots/prose-<page>-<width>-<phase>.png  (gitignored)
import { test } from "@playwright/test";

const PHASE = process.env.PROSE_PHASE ?? "before";

const PAGES = [
  // The comparison post the report was about. Also the ONLY blog post with no
  // `prose` class at all, so it is the one T1 alone cannot fix — worth watching.
  { name: "blog-comparison", path: "/blog/booking-koala-vs-jobber-vs-tidywise" },
  // Bare <h2>/<p> inside an inert `prose prose-sm` — the worst current case.
  { name: "privacy", path: "/privacy-policy" },
  // The only page with real spacing today (space-y-5 / space-y-2 in
  // termsContent.tsx), so it is the control: it should change least.
  { name: "terms", path: "/terms" },
  // A DB-driven post. This is where prose matters MOST: the stored HTML carries
  // no classes of its own, so before T1 it had literally no spacing rules at
  // all. Not in the original set, which was an omission — the hand-written posts
  // all have per-element classes and were never the worst case.
  { name: "blog-dynamic", path: "/blog/post/win-airbnb-short-term-rental-cleaning-contracts" },
];

const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "mobile", width: 390, height: 844 },
];

/**
 * The three things being fixed, measured rather than described:
 *   gapAboveHeading — space above a heading (the "flush" complaint)
 *   paragraphGap    — space between paragraphs
 *   columnWidth     — line length, in px and approximate characters
 */
async function measure(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const pick = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    // termsContent.tsx uses <h3> for section titles, not <h2> — an h2-only
    // selector reported "no h2 found" on the one page that is the control.
    const heading =
      pick("main h2") ?? pick("article h2") ?? pick(".prose h2") ??
      pick("main h3") ?? pick("article h3") ?? pick(".prose h3") ??
      pick("h2") ?? pick("h3");
    if (!heading) return { error: "no h2/h3 found on page" };

    const nextP =
      (heading.nextElementSibling as HTMLElement | null)?.tagName === "P"
        ? (heading.nextElementSibling as HTMLElement)
        : (heading.parentElement?.querySelector("p") as HTMLElement | null);

    const hs = getComputedStyle(heading);
    const ps = nextP ? getComputedStyle(nextP) : null;

    // The VISUAL gap above the heading, not just its own margin-top. In
    // termsContent.tsx the space comes from the parent section's `space-y-5`,
    // so reading heading.marginTop alone reported 0px and under-stated the very
    // thing being fixed. Report both, and say which source it came from.
    let gapAboveVisual = "n/a";
    const prev = heading.previousElementSibling as HTMLElement | null;
    if (prev) {
      gapAboveVisual =
        `${Math.round(heading.getBoundingClientRect().top - prev.getBoundingClientRect().bottom)}px`;
    } else {
      const parent = heading.parentElement;
      const parentPrev = parent?.previousElementSibling as HTMLElement | null;
      if (parent && parentPrev) {
        gapAboveVisual =
          `${Math.round(parent.getBoundingClientRect().top - parentPrev.getBoundingClientRect().bottom)}px (from parent — heading is first child)`;
      }
    }

    // Two ADJACENT SIBLING paragraphs. Taking the first two paragraphs anywhere
    // measured across intervening cards and reported a meaningless 113px.
    let paragraphGap: string | null = null;
    const allP = Array.from(
      document.querySelectorAll("main p, article p, .prose p"),
    ) as HTMLElement[];
    for (const first of allP) {
      const next = first.nextElementSibling as HTMLElement | null;
      if (next?.tagName === "P") {
        const a = first.getBoundingClientRect();
        const b = next.getBoundingClientRect();
        paragraphGap = `${Math.round(b.top - a.bottom)}px`;
        break;
      }
    }

    const col = nextP ?? heading;
    const colPx = Math.round(col.getBoundingClientRect().width);

    // Dead space either side of the reading column inside its parent. This is
    // the metric that was missing when max-w-[58ch] shipped without mx-auto:
    // the column was the right WIDTH but pinned to the parent's left edge, so
    // the text hugged one side of a bordered card. Equal values = centred.
    let columnOffset = "n/a";
    const proseEl = (col.closest(".prose") ?? col) as HTMLElement;
    const parentEl = proseEl.parentElement;
    if (parentEl) {
      const c = proseEl.getBoundingClientRect();
      const pr = parentEl.getBoundingClientRect();
      const ps = getComputedStyle(parentEl);
      const left = Math.round(c.left - (pr.left + parseFloat(ps.paddingLeft)));
      const right = Math.round(pr.right - parseFloat(ps.paddingRight) - c.right);
      columnOffset = `left ${left}px / right ${right}px${
        Math.abs(left - right) <= 2 ? " (centred)" : " (NOT centred)"
      }`;
    }
    // Rough characters-per-line: average glyph ~0.5em for body text.
    const fontPx = parseFloat(ps?.fontSize ?? hs.fontSize);
    const approxCh = Math.round(colPx / (fontPx * 0.5));

    // Does the page TITLE start at the same left edge as the body? Centring the
    // body alone left the h1 ~128px to its left, which read as a heading hanging
    // off the side. This is the check for that.
    const h1 = document.querySelector("main h1, article h1") as HTMLElement | null;
    let titleAlignment = "n/a (no h1)";
    if (h1 && nextP) {
      const delta = Math.round(
        h1.getBoundingClientRect().left - nextP.getBoundingClientRect().left,
      );
      titleAlignment = `h1 left edge ${delta >= 0 ? "+" : ""}${delta}px vs body${
        Math.abs(delta) <= 2 ? " (aligned)" : " (MISALIGNED)"
      }`;
    }

    return {
      headingTag: heading.tagName,
      titleAlignment,
      headingFontSize: hs.fontSize,
      gapAboveHeading: gapAboveVisual,
      headingMarginTopOwn: hs.marginTop,
      paragraphFontSize: ps?.fontSize ?? "n/a",
      paragraphLineHeight: ps?.lineHeight ?? "n/a",
      paragraphMarginBottom: ps?.marginBottom ?? "n/a",
      paragraphGap: paragraphGap ?? "n/a (fewer than 2 paragraphs found)",
      columnWidth: `${colPx}px (~${approxCh}ch)`,
      columnOffset,
    };
  });
}

for (const { name, path } of PAGES) {
  for (const vp of VIEWPORTS) {
    test(`${PHASE}: ${name} @ ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path, { waitUntil: "networkidle" });
      // Fonts settle after load; a swap mid-screenshot changes every metric.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);

      const m = await measure(page);
      console.log(`\n[${PHASE}] ${name} @ ${vp.label} (${vp.width}px) — ${path}`);
      for (const [k, v] of Object.entries(m)) console.log(`    ${k.padEnd(23)} ${v}`);

      await page.screenshot({
        path: `screenshots/prose-${name}-${vp.label}-${PHASE}.png`,
        fullPage: true,
      });
    });
  }
}
