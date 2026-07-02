
## 1. Pet Toggle (replaces the "+$25" dropdown card)

**Backend (migration)**
- Add `has_pets boolean not null default false` to `bookings`.
- Add `pet_fee numeric not null default 25` and `pet_toggle_enabled boolean not null default true` to `organization_pricing_settings` (single, org-wide pet fee — no more per-option list on the form).

**Frontend**
- `PublicBookingPage.tsx`: replace the pet cards grid with a single shadcn `Switch` — "Do you have any pets? +${pet_fee}".
- State becomes `hasPets: boolean`. `calculateTotal` adds `pet_fee` when true.
- Submit `has_pets` + include pet fee in `total_amount` (payload already flexible; add `pets: hasPets` in `extras` metadata for the edge function).
- Admin `ServicePricingEditor.tsx` gets a single "Pet fee" number input + toggle to show/hide the pet question (per-org, not per-service). Keeps existing `pet_options` array untouched for legacy data but no longer rendered on the public form.

## 2. Exclude Parameters (new admin settings section)

**Backend (same migration)**
Add to `organization_pricing_settings`:
- `excluded_room_types text[] not null default '{}'` — subset of `{"bedroom","bathroom","full_bath"}`.
- `room_reduction_prices jsonb not null default '{"bedroom":25,"bathroom":20,"full_bath":25}'` — fixed $ reduction per excludable type.

Extend the `get_public_booking_settings` RPC to return these two fields so the anon booking form can read them.

**Frontend**
- `ServicePricingEditor.tsx` — new "Exclude Parameters" card at the top of the Pricing tab: three checkboxes (Bedrooms, Bathrooms, Full Baths) + a `$` input next to each for the reduction amount. Saves via existing `useOrganizationSettings` hook (extended to include the new fields).
- Hide the bed/bath selectors on the public form for any type marked excluded. (E.g. if "bedroom" is excluded, bedrooms picker disappears entirely.)

## 3. "Don't need the entire home cleaned?" reducer

**Frontend only** — no new columns; the reduction is captured in existing `notes` + reflected in `total_amount`.

- On Step 1 of `PublicBookingPage.tsx`, below the bed/bath selectors, render a collapsible (shadcn `Collapsible`) button: "Don't need the entire home cleaned?".
- When opened, render one row per **non-excluded** room type from settings: label, minus/plus buttons, current count (starts at the selected bed/bath count), and the `$-X` reduction value shown live.
- New state: `roomReductions: Record<'bedroom'|'bathroom'|'full_bath', number>` — number of rooms the customer is skipping.
- `calculateTotal` subtracts `reductions[type] * price[type]` from the base, floored at the service's `minimum_price`.
- The Price Summary card now shows a per-type breakdown:
  ```
  Base                   $220
  Skip 1 bedroom          -$25
  Skip 2 bathrooms        -$40
  ─────────────────────
  Total                   $155
  ```
- Reductions are added to `notes` (`"Skipping: 1 bedroom, 2 bathrooms"`) and included in the `total_amount` sent to `external-booking-webhook`, so the backend records the discounted total naturally.

## Files touched

**Migration** (one)
- Adds columns to `bookings` + `organization_pricing_settings`; updates `get_public_booking_settings` RPC.

**Frontend**
- `src/hooks/useOrganizationSettings.ts` — add new fields to interface, fetch, save.
- `src/hooks/usePublicOrgPricing.ts` — expose `excludedRoomTypes`, `roomReductionPrices`, `petFee`, `petToggleEnabled` from the RPC result.
- `src/components/admin/ServicePricingEditor.tsx` — new Exclude Parameters card + Pet fee editor.
- `src/pages/PublicBookingPage.tsx` — pet toggle, hide excluded selectors, new "Don't need entire home" collapsible + itemized summary.

No changes to `external-booking-webhook` — it already accepts arbitrary `total_amount` and `notes`.
