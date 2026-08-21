# Mobile mockups — 76 comps

`TidyWise-Mockups.html` is **the source of truth for measurements**. Read
spacing, radii, weights and sizes out of the markup rather than eyeballing the
PNGs. Each comp is a `<div id="...">` — `1a`…`11d`, 76 in total, most rendered
twice (LIGHT and DARK) at a 390px card width.

```sh
python3 design/mockups/extract.py 5a          # readable text
python3 design/mockups/extract.py 5a --raw    # markup, with the inline styles
```

## Colours do not get copied

The comps' blue is `#2B5CE6` and their green is `#129E6A`. Both are values this
project **rejected** — see §1.1a/§1.1b of the design spec. Every colour
translates to a `--pv-*` token; no raw hex reaches a component, and
`check-color-pairs.mjs` enforces it.

## Where the comp does not win

Three standing exceptions, everything else the comp wins:

1. **The comp reproduces a live bug.** The collapsed status enum in `4c` and
   the render-time "last updated" stamp in `5r` are the examples.
2. **The comp was drawn wider than 390px** and packing its facts onto one line
   truncates the last one. Measured, not assumed — it happened five times.
3. **Colour**, as above.

## Why this directory exists

These arrived as chat attachments and were lost once they fell out of context,
which cost a rebuild of work that had already been done. They live on disk now.
