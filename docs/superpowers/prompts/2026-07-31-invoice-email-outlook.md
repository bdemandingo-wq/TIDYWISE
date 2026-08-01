# Lovable prompt — make the emailed invoice render in Outlook

**File:** `supabase/functions/send-invoice/index.ts` — one template, the only
invoice email path.
**Problem:** the layout is built from `display:flex` (×4) and `display:grid` (×1).
Outlook on Windows renders with Word's engine, which supports neither, so every
one of those containers collapses and its children stack vertically.

**Not a CSS-support problem in the usual sense.** `text-align:right` works fine in
Outlook. What breaks is that the right-hand block is positioned by *flex*, so
when flex is ignored the block becomes full width and drops below the left one —
the text still right-aligns, just against the whole 760px.

**Affects:** Outlook 2016/2019/2021 and Outlook 365 desktop on Windows, plus
Windows Mail. Apple Mail, iOS Mail, Gmail, Outlook.com and Outlook for Mac all
render the current version correctly and will render the table version correctly
too — tables are the safe intersection, not a downgrade.

**Leave the line-items table alone.** It is already a correct
`role="presentation"` table with `text-align` on cells and needs no change.

---

## The worst one: the totals block

This is the one to fix first. Each row is a flex pair, so in Outlook **every
total becomes two lines** — the word "Subtotal", then the amount underneath it.
On the document someone reads immediately before deciding to pay, it looks like
the invoice is broken.

### BEFORE (`:296-307`)

```html
<div style="padding:0 32px 24px;display:flex;justify-content:flex-end;">
  <div style="width:100%;max-width:320px;border:1px solid ${BORDER};border-radius:16px;padding:18px 20px;">
    <div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;color:${SLATE};margin-bottom:10px;">
      <span style="color:${MUTED};">Subtotal</span>
      <span>${formatMoney(data.subtotal)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:16px;font-size:18px;font-weight:800;color:${ACCENT};">
      <span>Total</span>
      <span>${formatMoney(data.total)}</span>
    </div>
  </div>
</div>
```

### AFTER

```html
<div style="padding:0 32px 24px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td align="right">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="320"
               style="width:320px;max-width:100%;border:1px solid ${BORDER};border-radius:16px;">
          <tr>
            <td align="left" style="padding:18px 8px 10px 20px;font-size:14px;color:${MUTED};">Subtotal</td>
            <td align="right" style="padding:18px 20px 10px 8px;font-size:14px;color:${SLATE};white-space:nowrap;">${formatMoney(data.subtotal)}</td>
          </tr>
          <tr>
            <td align="left" style="padding:0 8px 18px 20px;font-size:18px;font-weight:800;color:${ACCENT};">Total</td>
            <td align="right" style="padding:0 20px 18px 8px;font-size:18px;font-weight:800;color:${ACCENT};white-space:nowrap;">${formatMoney(data.total)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
```

Four things doing specific work:

- **`align="right"` as an HTML attribute**, not `justify-content`. Word honours the
  attribute and ignores the CSS.
- **`width="320"` attribute alongside `style="width:320px"`.** Outlook reads the
  attribute; everything else reads the CSS. `max-width:100%` keeps it from
  overflowing a narrow phone.
- **Padding replaces `gap`.** Asymmetric — more on the outer edges, less between
  the columns — so it reads like the original spacing.
- **`white-space:nowrap` on the amounts**, so a long total can't wrap onto a second
  line inside its own cell, which would recreate the bug it is fixing.

---

## The prompt

````
Please update supabase/functions/send-invoice/index.ts and redeploy it.

PROBLEM: the invoice email HTML uses display:flex (4 places) and display:grid
(1 place) for layout. Outlook on Windows renders email with Microsoft Word's
engine, which supports neither, so those containers collapse and their children
stack vertically. Right-aligned blocks fall underneath the left-hand ones, and
the totals block turns every "Subtotal / $120.00" pair into two separate lines.
Apple Mail, Gmail and Outlook.com are unaffected, which is why it looks correct
in testing.

FIX: replace all five layout containers with presentation tables, using align as
an HTML ATTRIBUTE rather than CSS, and cell padding instead of gap.

DO NOT change the line items table — it is already a correct
role="presentation" table and renders fine.
DO NOT change any copy, any amount, any colour variable, or the sending logic.
This is markup only.

────────────────────────────────────────────────────────────────────────
CHANGE 1 of 4 — the totals block (do this one first, it is the worst)
────────────────────────────────────────────────────────────────────────
REPLACE:

    <div style="padding:0 32px 24px;display:flex;justify-content:flex-end;">
      <div style="width:100%;max-width:320px;border:1px solid ${BORDER};border-radius:16px;padding:18px 20px;">
        <div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;color:${SLATE};margin-bottom:10px;">
          <span style="color:${MUTED};">Subtotal</span>
          <span>${formatMoney(data.subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:16px;font-size:18px;font-weight:800;color:${ACCENT};">
          <span>Total</span>
          <span>${formatMoney(data.total)}</span>
        </div>
      </div>
    </div>

WITH:

    <div style="padding:0 32px 24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="right">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="320"
                   style="width:320px;max-width:100%;border:1px solid ${BORDER};border-radius:16px;">
              <tr>
                <td align="left" style="padding:18px 8px 10px 20px;font-size:14px;color:${MUTED};">Subtotal</td>
                <td align="right" style="padding:18px 20px 10px 8px;font-size:14px;color:${SLATE};white-space:nowrap;">${formatMoney(data.subtotal)}</td>
              </tr>
              <tr>
                <td align="left" style="padding:0 8px 18px 20px;font-size:18px;font-weight:800;color:${ACCENT};">Total</td>
                <td align="right" style="padding:0 20px 18px 8px;font-size:18px;font-weight:800;color:${ACCENT};white-space:nowrap;">${formatMoney(data.total)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

────────────────────────────────────────────────────────────────────────
CHANGE 2 of 4 — the header (company details / invoice number)
────────────────────────────────────────────────────────────────────────
REPLACE the opening div and its two children:

    <div style="padding:32px;border-bottom:1px solid ${BORDER};display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;">
      <div>
        ...logo, company name, company meta...
      </div>
      <div style="text-align:right;">
        ...INVOICE label, invoice number, Sent pill...
      </div>
    </div>

WITH a two-column presentation table, keeping the inner content EXACTLY as it is:

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="border-bottom:1px solid ${BORDER};">
      <tr>
        <td align="left" valign="top" style="padding:32px 12px 32px 32px;">
          ...logo, company name, company meta — unchanged...
        </td>
        <td align="right" valign="top" style="padding:32px 32px 32px 12px;">
          ...INVOICE label, invoice number, Sent pill — unchanged...
        </td>
      </tr>
    </table>

Keep `text-align:right` on the right-hand cell's inner divs as well as the
align attribute — the attribute positions the cell content for Word, the CSS
handles clients that ignore the attribute.

────────────────────────────────────────────────────────────────────────
CHANGE 3 of 4 — Bill To / Invoice Date (this is the display:grid one)
────────────────────────────────────────────────────────────────────────
REPLACE:

    <div style="padding:32px;border-bottom:1px solid ${BORDER};display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;">
      <div> ...Bill To block... </div>
      <div style="text-align:right;"> ...Invoice Date / Due Date block... </div>
    </div>

WITH:

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
           style="border-bottom:1px solid ${BORDER};">
      <tr>
        <td align="left" valign="top" width="50%" style="padding:32px 12px 32px 32px;">
          ...Bill To block — unchanged...
        </td>
        <td align="right" valign="top" width="50%" style="padding:32px 32px 32px 12px;">
          ...Invoice Date / Due Date block — unchanged...
        </td>
      </tr>
    </table>

The original grid was responsive (auto-fit at 240px). A fixed two-column table
is not, but at 760px total each column is 380px, which is comfortable for an
address. Mobile clients that respect max-width will still shrink it.

────────────────────────────────────────────────────────────────────────
CHANGE 4 of 4 — the logo
────────────────────────────────────────────────────────────────────────
The logo img uses object-fit:contain, which Outlook ignores, so a non-square
logo can stretch. Add explicit height and let width scale:

REPLACE  style="max-height:48px;max-width:180px;object-fit:contain;display:block;margin-bottom:12px;"
WITH     style="max-height:48px;max-width:180px;height:auto;width:auto;display:block;border:0;margin-bottom:12px;"

`border:0` suppresses the blue border Outlook draws around linked images.

────────────────────────────────────────────────────────────────────────
LEAVE ALONE
────────────────────────────────────────────────────────────────────────
- The line items table (already correct).
- Every border-radius. Outlook ignores them and renders square corners; every
  other client shows them. That is a cosmetic difference, not a broken layout,
  and the workaround (VML round rectangles) is not worth the markup.
- The Pay button. It is a block-level anchor with text-align:center, which
  Outlook handles.
- All colours, copy, amounts and the sending logic.

AFTERWARDS
- Confirm the function is DEPLOYED, not merely committed.
- Send one test invoice to an address you can open in Outlook on Windows, and
  confirm: company details and invoice number sit SIDE BY SIDE, Bill To and the
  dates sit side by side, and each totals row is ONE line with the amount on the
  right.
````

---

## What this does not fix

**No Outlook render has been seen** — not before the change and not after. I have
read the markup and know which constructs Word's engine drops, but nobody has
opened one of these invoices in Outlook on Windows, including to confirm the
original report. The test step above is the only real verification.

**Dark mode is untouched.** Outlook and Apple Mail both invert colours in dark
mode in ways that hardcoded hex values fight. Not part of this change, but it is
the next thing likely to look wrong on a customer's screen.
