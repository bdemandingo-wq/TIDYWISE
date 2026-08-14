# Surface `customer_notes` in the CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render what the customer wrote on their own booking, clearly marked as theirs, on the four surfaces where someone needs it — without touching the admin's own editable `notes` field.

**Architecture:** One pure helper in `src/lib/customerNotes.ts` answers "is there anything to show?", one shared presentational component renders it, and four call sites use both. Nothing new is written or edited; this is display only.

**Tech Stack:** React + TypeScript, shadcn, `node:test`.

**Status:** Plan and spec written 2026-08-14. **Nothing implemented.** Spec is RED.

---

## Global Constraints

- **Read-only.** `customer_notes` is the customer's own words. It is never edited, never saved, never bound to a form control. The admin's `notes` field stays exactly as it is: editable, separate, labelled "Special Instructions".
- **Render only when non-empty.** Most bookings have no customer note and never will. An empty labelled box on every booking is clutter — and on a staff job card it is clutter in front of someone deciding whether to accept work.
- **Two labels, never one.** "From the customer" vs "Special Instructions". Unlabelled twin blocks would be worse than the current single block.
- No schema changes, no new queries beyond widening three existing `select` lists, no edge-function work.
- Verify with `npx tsc --noEmit -p tsconfig.app.json` — **the `-p` flag is not optional**.

---

## What's already true (verified on `origin/main`, not assumed)

- `bookings.customer_notes` exists, typed `string | null`.
- `ingest-external-booking:167` writes `customer_notes: body.notes ?? null`. The old `"Imported from external site"` fallback is **gone**, and it no longer writes to `notes` — the admin's field is no longer being overwritten.
- **Nothing in `src/` reads it.** `git grep customer_notes -- src/` returns three hits, all in generated `types.ts`.

---

## The asymmetry that dictates task order

The two surfaces are not equally ready, and getting this backwards produces a change that looks finished and displays nothing:

| Surface | Data already arriving? |
|---|---|
| **Admin** (`BookingDialogs.tsx`) | **Yes.** `useBookings` selects `*` (`:188`, `:228`, `:267`), so `customer_notes` is on every booking object today. Render-only. |
| **Staff** (`AvailableJobCard`, `MyJobCard`) | **No.** `StaffPortal.tsx` uses explicit column lists at `:351`, `:372`, `:508`. All three include `notes`; none include `customer_notes`. |

So the staff cards must have their **queries widened before any JSX is written**. Add the render first and the cards render nothing — no error, no warning, no empty box, just silence. That failure is invisible in exactly the way this whole feature exists to fix.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/customerNotes.ts` | **Create.** Pure: "is there anything to render?" + the label constant. Zero imports. |
| `src/lib/customerNotes.test.ts` | ✅ **Written — 11 tests, RED verified** |
| `src/components/CustomerNotesBlock.tsx` | **Create.** The one shared presentational block. Top-level `src/components/`, because it is used by both `admin/` and `staff/`. |
| `src/pages/staff/StaffPortal.tsx` | **Modify.** Widen three `select` lists. |
| `src/components/staff/AvailableJobCard.tsx` | **Modify.** Interface field + render. |
| `src/components/staff/MyJobCard.tsx` | **Modify.** Interface field + render. |
| `src/components/admin/BookingDialogs.tsx` | **Modify.** Two render sites — detail view and edit panel. |

---

## Task 1 — the pure helper

**Files:** Create `src/lib/customerNotes.ts`; Test `src/lib/customerNotes.test.ts` ✅ written

- [ ] **Step 1: Add throwing stubs, then watch 11 tests fail individually.**

The spec currently fails as **one** `ERR_MODULE_NOT_FOUND`, collecting zero tests — a real RED, but one that cannot tell 11 wired tests from a typo in the import path.

```bash
node --experimental-strip-types --test src/lib/customerNotes.test.ts
# expect: tests 11, fail 11
```

- [ ] **Step 2: Implement.** Zero imports.

**Interfaces — Produces:**

```ts
export const CUSTOMER_NOTES_LABEL = "From the customer";
export function customerNotesToRender(raw: unknown): string | null;
```

`customerNotesToRender` returns the trimmed string, or `null` when there is nothing worth showing. It must:

- return `null` for `null`, `undefined`, `""`, whitespace-only, and any non-string;
- trim surrounding whitespace but **preserve internal line breaks** — access instructions are almost always multi-line and the render sites use `whitespace-pre-wrap`, so flattening them here would destroy the content this feature exists to surface.

Why `unknown` and not `string | null`: the value crosses a public form on another site and then an edge-function payload. `{booking.customer_notes && …}` is the thing this replaces — it renders an empty labelled box for a customer who pressed space.

- [ ] **Step 3: 11/11 green;** `grep -c '^import' src/lib/customerNotes.ts` returns 0.
- [ ] **Step 4: Commit.**

---

## Task 2 — the shared block

**Files:** Create `src/components/CustomerNotesBlock.tsx`

- [ ] **Step 1: One component, two visual variants.** The existing note blocks differ by surface: staff cards use a warning-toned box (`MyJobCard:382-390`), the admin detail view uses a plain bordered card (`BookingDialogs:277-280`). Match each rather than imposing one look on both.

```tsx
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CUSTOMER_NOTES_LABEL, customerNotesToRender } from '@/lib/customerNotes';

/**
 * The customer's own words on their booking. READ-ONLY BY CONSTRUCTION — this
 * renders text, never a form control. A disabled <Textarea> would invite an edit
 * that silently vanishes: the save path at BookingDialogs.tsx:497 writes `notes`
 * only, and this is `customer_notes`.
 *
 * Renders nothing at all when there is no note. Most bookings have none.
 */
export function CustomerNotesBlock({
  value,
  variant = 'card',
  className,
}: {
  value: unknown;
  variant?: 'card' | 'staff';
  className?: string;
}) {
  const text = customerNotesToRender(value);
  if (!text) return null;

  if (variant === 'staff') {
    return (
      <div className={cn('p-3 rounded-lg bg-info/10 border border-info/20', className)}>
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-info mb-1">{CUSTOMER_NOTES_LABEL}</p>
            <p className="text-sm text-info whitespace-pre-wrap">{text}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <p className="text-xs text-muted-foreground mb-1">{CUSTOMER_NOTES_LABEL}</p>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}
```

- [ ] **Step 2:** the staff variant uses `info` tones, not the `warning` tones the existing Special Instructions block uses. Two identically-coloured warning boxes stacked would read as one message split in half; different tone is what makes "two distinct sources" legible at a glance.
- [ ] **Step 3: Typecheck.**

---

## Task 3 — widen the staff queries FIRST

**Files:** Modify `src/pages/staff/StaffPortal.tsx`

> Do this before Task 4. Rendering without it produces silent blanks.

- [ ] **Step 1:** Add `customer_notes` to the three explicit column lists. Each currently reads `… cleaner_checkin_at, cleaner_checkout_at, notes,` (`:351`, `:372`) and `… square_footage, bedrooms, bathrooms, notes,` (`:508`). Add `customer_notes` alongside `notes` in all three. **Do not** switch them to `*` — the narrow lists are deliberate on a portal that loads over mobile data.
- [ ] **Step 2:** Add `customer_notes?: string | null;` to the booking type at `StaffPortal.tsx:76`.
- [ ] **Step 3: Verify the data actually arrives before writing any JSX.** Log one booking object, or check the network response, and confirm the key is present. This is the step that makes Task 4 meaningful rather than hopeful.

---

## Task 4 — the four render sites

**Files:** Modify `AvailableJobCard.tsx`, `MyJobCard.tsx`, `BookingDialogs.tsx`

- [ ] **Step 1: `AvailableJobCard.tsx`** — add `customer_notes?: string | null;` to the booking interface (near `:34`), then render **directly below** the existing Special Instructions block at `:178-184`:

```tsx
<CustomerNotesBlock value={booking.customer_notes} variant="staff" />
```

- [ ] **Step 2: `MyJobCard.tsx`** — same, interface near `:47`, render below `:381-391`.
- [ ] **Step 3: `BookingDialogs.tsx` detail view** — below the read-only notes block at `:276-281`:

```tsx
<CustomerNotesBlock value={booking.customer_notes} />
```

- [ ] **Step 4: `BookingDialogs.tsx` edit panel** — directly above the Special Instructions `<Textarea>` at `:584`, so the customer's words are visible while the admin writes their own note. Above, not below: it is context for what you are about to type.
- [ ] **Step 5:** In all four, the customer block goes **after** (or above, in the edit panel) the existing `notes` block — never replacing it, never merged with it.
- [ ] **Step 6: Typecheck, lint the touched files, `npm run build`.**

---

## Task 5 — verification

- [ ] `node --experimental-strip-types --test src/lib/customerNotes.test.ts` — 11/11
- [ ] `npx tsc --noEmit -p tsconfig.app.json`
- [ ] `npm run lint` on the touched files; count pre-existing errors on the `origin/main` versions first so "new" and "already there" are distinguishable
- [ ] **Against a booking that has a customer note** (a forwarded one from the cleaning site): it appears on all four surfaces, labelled "From the customer", visually distinct from Special Instructions.
- [ ] **Against a booking that has none** (most of them): no block, no gap, no empty border, on all four.
- [ ] **The negative that matters most:** open the edit panel on a booking with a customer note, change Special Instructions, save, reopen. The customer note must be unchanged and the admin note must have saved. That is the check that proves the two fields never crossed.

---

## Self-review

**Shape coverage.** Read-only → renders text, never a form control, and `notes` keeps its own editable `<Textarea>` untouched. Clearly labelled → "From the customer" as an exported constant so all four sites use the same string, in a different tone from Special Instructions. Only when non-null → `customerNotesToRender` returns null for null, empty, whitespace-only and non-strings, and the component returns `null` rather than an empty wrapper. Four sites → two admin, two staff.

**Deliberately excluded.** No editing, no history, no "customer said X on DATE" timestamp, no surfacing on the client portal or in emails, no aggregate view. No change to `ingest-external-booking` — it is already writing the right column.

**The risk I would flag.** Task 3 before Task 4 is not stylistic. If the render ships first, every staff card silently shows nothing, and it will look correct in review — the block is *supposed* to be invisible when there is no note. There is no error to notice. Step 3's "verify the data arrives" is the only thing standing between that and a feature that ships broken and reads as working.

**Unverified.** Whether any booking in TIDYWISE currently has a non-null `customer_notes`. The column was only recently pointed at by the ingest function, and I have no credential for that org — my token is scoped to a different one. If none exists yet, Task 5's positive check needs a fresh forwarded booking, and until then the feature can only be verified in its invisible state, which proves the weaker half.
