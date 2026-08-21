/**
 * Where "Add to Dock…" sits in Safari's File menu.
 *
 * Chrome and Edge get a real Install button on the page, because they fire
 * `beforeinstallprompt` and we can act on it. Safari never fires it on any
 * platform, so those users get an instruction instead — and an instruction
 * about the MENU BAR is the one thing a web page fundamentally cannot point at.
 * It lives in browser chrome, outside the document. No highlight, no arrow, no
 * scroll-into-view reaches it. A picture is the only honest option left.
 *
 * Inline SVG rather than a PNG in /public: it is under 2 KB of markup, needs no
 * request, stays crisp on a Retina display at any size, and — the part a
 * screenshot cannot do — recolours itself for dark mode, because every fill is
 * a Tailwind theme token rather than a baked pixel.
 *
 * ACCURACY: the five named items are really in Safari's File menu, in this
 * relative order. The menu is longer than this; the "⋯" row is there to say so
 * rather than imply these five are all of it. If you extend this, keep that
 * property — a diagram that quietly invents a menu item is worse than no
 * diagram, because someone will hunt for the item that isn't there.
 *
 * No Apple logo. The leading dot is a neutral placeholder, deliberately not a
 * traced trademark.
 */
export function AddToDockDiagram() {
  return (
    /*
      SIZE: the viewBox is 210 units wide and the labels are 8.5 units, so the
      rendered text is 8.5 × (width / 210) px. At the 210px I first tried that
      is 8.5px type — technically "small", actually unreadable. 280px puts it a
      shade over 11px, which is the smallest this can be and still be worth
      drawing. Don't shrink it back without checking the labels.
    */
    <svg
      viewBox="0 0 210 130"
      className="mt-3 h-auto w-full max-w-[280px]"
      role="img"
      aria-label="Diagram of the macOS menu bar with Safari's File menu open. Add to Dock is highlighted, below New Window, New Tab and Open File, and above Share."
    >
      {/* Menu bar */}
      <rect x="0" y="0" width="210" height="18" rx="4" className="fill-muted" />
      <circle cx="10" cy="9" r="3" className="fill-muted-foreground/60" />
      <text x="19" y="12.3" fontSize="8.5" fontWeight="600" className="fill-foreground">
        Safari
      </text>

      {/* "File" drawn as the open menu — the title stays highlighted while its
          dropdown is showing, which is the visual cue that ties the two halves
          of this diagram together. */}
      <rect x="50" y="2" width="24" height="14" rx="3" className="fill-primary" />
      <text x="54" y="12.3" fontSize="8.5" className="fill-primary-foreground">
        File
      </text>

      <text x="79" y="12.3" fontSize="8.5" className="fill-muted-foreground">
        Edit
      </text>
      <text x="101" y="12.3" fontSize="8.5" className="fill-muted-foreground">
        View
      </text>

      {/* Dropdown, left-aligned to the File title it hangs from. */}
      <rect
        x="50"
        y="19"
        width="124"
        height="104"
        rx="5"
        className="fill-popover stroke-border"
        strokeWidth="1"
      />

      <text x="58" y="34" fontSize="8.5" className="fill-muted-foreground">
        New Window
      </text>
      <text x="58" y="50" fontSize="8.5" className="fill-muted-foreground">
        New Tab
      </text>
      <text x="58" y="66" fontSize="8.5" className="fill-muted-foreground">
        Open File…
      </text>

      {/* Says "this menu continues" so the five named rows don't read as the
          whole thing. */}
      <text x="58" y="82" fontSize="8.5" className="fill-muted-foreground/70">
        ⋯
      </text>

      <rect x="54" y="87" width="116" height="15" rx="3" className="fill-primary" />
      <text x="58" y="97.5" fontSize="8.5" fontWeight="600" className="fill-primary-foreground">
        Add to Dock…
      </text>

      <text x="58" y="115" fontSize="8.5" className="fill-muted-foreground">
        Share
      </text>

      {/* Pointer at the highlighted row. The highlight alone reads as "hovered"
          more than "this one"; the arrow removes the ambiguity. */}
      <path
        d="M204 94.5 H184 M184 94.5 l5 -3.5 M184 94.5 l5 3.5"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
