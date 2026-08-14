# Bathrooms + Customer Notes Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin booking-form stepper show the bathroom count that is actually stored, and show the customer's own note on the Payment & Notes panel.

**Architecture:** Both are the same missing wiring in the same file. `BookingFormContext.tsx` declares state and exposes it but never populates it from the booking row. No new logic, no new component — `CustomerNotesBlock` and `customerNotesToRender` already exist and are tested.

**Tech Stack:** React + TypeScript, `node:test`.

**Status:** Plan and spec written 2026-08-14. **Nothing implemented.** Spec is RED — 7 of 10 failing.

---

## Global Constraints

- **Two paths, always.** Every booking-derived field must be set in `prefillFromBooking` **and** `resetForm`. The loader alone leaves a stale value carrying into the next booking in the same session.
- **`customer_notes` stays read-only.** No setter on the context, no form control. The save path writes `notes` only, so an exposed setter would silently discard edits.
- **Reuse `CustomerNotesBlock`.** It already ships on four surfaces; this is the fifth render site, not a fifth implementation.
- **Add-on quantity is out of scope.** The CRM's extras model has no quantity dimension at all (`selectedExtras: string[]`, `extrasTotal` adds each price once). That is a schema-and-pricing change, tracked separately.
- Verify with `npx tsc --noEmit -p tsconfig.app.json` — **the `-p` flag is not optional**.

---

## What's actually wrong (verified on `origin/main`)

`notes` is the model of a correctly-wired field — seven touchpoints:

```
:88   notes: string;                        interface (value)
:177  setNotes: (notes: string) => void;    interface (setter)
:277  const [notes, setNotes] = useState('');
:502  setNotes('');                         resetForm
:547  setNotes(booking.notes || '');        prefillFromBooking
:733  notes,                                provider value
:797  setNotes,                             provider value
```

**`bathrooms` has four of those seven.** Interface `:63`/`:160`, state `:253` (`useState('1')`), provider value `:716`/`:780` — and **`setBathrooms` is never called**. Not in `resetForm`, not in `prefillFromBooking`. So loading a booking whose row holds `"2.5"` renders `1 ba`: the useState default, never overwritten. `tsc` is happy because every *declaration* is present; the only thing missing is a call.

**`customerNotes` has none of them.** `grep` for `customerNotes`/`customer_notes` in `BookingFormContext.tsx` returns nothing, which is why the Payment & Notes panel shows no block — the value cannot reach `PaymentStep`.

Ordering matters within the file: `resetForm` is `:494`, `prefillFromBooking` is `:531`. The interface block precedes both; the provider value follows.

---

## Why the spec is a static test

There is no logic here to unit-test — it is state plumbing, and the pure part (`customerNotesToRender`) already has 11 tests of its own. The defect class is a **missing call**, which type-checking cannot see and which no existing test could reach: vitest and `@testing-library` are not installed in this repo.

So `bookingFormWiring.test.ts` reads the source as text, brace-matches the two function bodies, and asserts the calls exist. Blunt, deliberately. It fails on exactly the bug that shipped, and it would have failed before it shipped.

It carries a **control** — `setNotes` is wired in both paths — so that if the brace-matcher ever finds the wrong region, one test says so instead of nine passing meaninglessly.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/admin/booking-form/bookingFormWiring.test.ts` | ✅ **Written — 10 tests, RED (7 failing)** |
| `src/components/admin/booking-form/BookingFormContext.tsx` | **Modify.** 2 bathrooms calls + 5 customerNotes touchpoints. |
| `src/components/admin/booking-form/steps/PaymentStep.tsx` | **Modify.** Import + render above Special Instructions. |

---

## Task 1 — bathrooms

**Files:** Modify `BookingFormContext.tsx`

- [ ] **Step 1: `resetForm`, alongside `:514-515`.**

```ts
    setBedrooms('1');
    setBathrooms('1');        // NEW — must match the useState default at :253
    setSquareFootage('');
```

- [ ] **Step 2: `prefillFromBooking`, alongside `:586-587`.**

```ts
    setBedrooms(booking.bedrooms || '1');
    setBathrooms(booking.bathrooms || '1');    // NEW
    setSquareFootage(booking.square_footage || '');
```

`|| '1'` and not `?? '1'`: an empty string is as unrenderable as null to the `<Select>`, whose options are `['1','1.5','2','2.5','3','3.5','4','4.5','5','5.5','6']` (`pricingData.ts:180`). Both must fall back to a value that exists in that list.

- [ ] **Step 3:** the three `'1'` defaults — useState, reset, prefill fallback — must agree. A spec test asserts this; disagreement produces a Select that renders blank.
- [ ] **Step 4:** `node --experimental-strip-types --test src/components/admin/booking-form/bookingFormWiring.test.ts` — the two bathrooms tests and the invariant now pass.

---

## Task 2 — customerNotes state

**Files:** Modify `BookingFormContext.tsx`

Five touchpoints, mirroring `notes` but **without a setter on the context**.

- [ ] **Step 1: interface, near `:88`** — value only:

```ts
  notes: string;
  /** The customer's own words, read-only. No setter: the save path writes `notes`. */
  customerNotes: string;
```

Do **not** add `setCustomerNotes` near `:177`. Its absence is what makes read-only a type error rather than a convention, and a spec test asserts it stays absent.

- [ ] **Step 2: state, near `:277`.**

```ts
  const [customerNotes, setCustomerNotes] = useState('');
```

The setter exists locally — `resetForm` and `prefillFromBooking` need it — it simply is not exported.

- [ ] **Step 3: `resetForm`, alongside `:502`.**

```ts
    setNotes('');
    setCustomerNotes('');
```

- [ ] **Step 4: `prefillFromBooking`, alongside `:547`.**

```ts
    setNotes(booking.notes || '');
    setCustomerNotes(
      (booking as { customer_notes?: string | null }).customer_notes || '',
    );
```

The cast is needed because `BookingWithDetails` does not declare `customer_notes` — the same cast `BookingDialogs.tsx:286` already uses. Widening that interface is a larger change and is not this task.

- [ ] **Step 5: provider value, near `:733`** — `customerNotes,` and **nothing** near `:797`.
- [ ] **Step 6:** re-run the spec; the three customerNotes tests pass and the two read-only guards stay passing.

---

## Task 3 — render it on Payment & Notes

**Files:** Modify `steps/PaymentStep.tsx`

- [ ] **Step 1: import the existing component and consume the context.**

```ts
import { CustomerNotesBlock } from '@/components/CustomerNotesBlock';
```

`customerNotes` comes off the same booking-form context hook `PaymentStep` already uses for `notes`/`setNotes`.

- [ ] **Step 2: render above the Special Instructions field** — the block goes before the `<Label>` at `:334`:

```tsx
          <CustomerNotesBlock value={customerNotes} className="mb-4" />
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Special Instructions</Label>
          </div>
```

Above, not below: it is context for what the admin is about to type. A spec test asserts the source order.

- [ ] **Step 3:** default `variant="card"` — this is an admin dialog, matching the other admin surfaces. Do not pass `variant="staff"`.
- [ ] **Step 4:** do not hardcode the label. A spec test fails if the string `"From the customer"` appears in `PaymentStep.tsx`.
- [ ] **Step 5:** 10/10 green, `tsc`, lint, `npm run build`.

---

## Task 4 — verification

- [ ] `node --experimental-strip-types --test src/components/admin/booking-form/bookingFormWiring.test.ts` — 10/10
- [ ] `node --experimental-strip-types --test src/lib/customerNotes.test.ts` — 11/11, unchanged
- [ ] `npx tsc --noEmit -p tsconfig.app.json`
- [ ] `npm run lint` on both touched files; count pre-existing errors on the `origin/main` versions first so new and pre-existing are distinguishable
- [ ] **Bathrooms, the real check:** open a booking whose row holds a non-`1` bathroom count and confirm the Select shows it. `2.5` is the value that started this — it is a valid option, so if it still renders `1` the wiring did not take.
- [ ] **Bathrooms, the stale-value check:** open a booking with `3` baths, close, then open one with `1`. The second must show `1`, not `3`. This is what Step 1 of Task 1 exists for and the loader alone would not fix it.
- [ ] **Customer note:** on a booking whose row has non-null `customer_notes`, the block appears above Special Instructions on Payment & Notes, labelled "From the customer".
- [ ] **The negative:** on a booking with null `customer_notes`, no block and no gap.
- [ ] **The one that proves they stay separate:** edit Special Instructions on a booking that has a customer note, save, reopen. The customer's text unchanged, the admin's text saved.

---

## Self-review

**Coverage.** Bathrooms in both loader and reset ✓ (Task 1, both steps, and the spec's invariant covers both). `customerNotes` state, loader, reset, context exposure ✓ (Task 2). Rendered via the existing component above Special Instructions ✓ (Task 3). Add-on quantity untouched ✓.

**Deliberately excluded.** No widening of `BookingWithDetails` to declare `customer_notes` — a local cast matches what `BookingDialogs.tsx:286` already does, and changing that shared interface touches every consumer. No `setCustomerNotes` on the context. No change to `notes`, its Textarea, or the save path. Nothing about add-on quantities.

**What I got wrong last time, recorded so the fix is aimed right.** I added `CustomerNotesBlock` to `EditBookingDialog` and the two staff cards, reading "the Edit Booking panel" as `BookingDialogs.tsx`. The panel in question is the stepper's Payment & Notes (`PaymentStep.tsx:324`). I had flagged that two "Special Instructions" fields exist and picked the wrong one. This adds the fifth site rather than moving anything — the four existing renders are all correct and stay.

**Unverified.** Whether the third test booking's `customer_notes` is non-null, and whether its stored `bathrooms` is `"2.5"`. Both rows are TIDYWISE-scoped and my only credential belongs to another org. The bathrooms fix is provable without them — the `1` you see is React state, not stored data, so it is wrong regardless of what the row holds. The customer-note check does need a row with a value; if none exists, Task 4's positive check needs a fresh forwarded booking with text typed into the site's Special Instructions box.
