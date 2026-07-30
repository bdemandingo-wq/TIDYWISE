# Lovable prompt — portal address correction

**Status:** not yet run — but the design decision below is **SETTLED** (owner, 2026-07-30). Send as written.
**Frontend:** not written yet — this is the backend half only.
**Target:** a new `update_client_portal_location` RPC + a `client-portal-api` action

---

## The design decision this rests on — read this first

Investigated 2026-07-29. `bookings` carries **both** an id reference and copied text:

| Column | Exists |
|---|---|
| `bookings.location_id` | yes — read at `BookingFormContext:582`, sent at `PortalRequestPage:249` |
| `bookings.address` / `.city` / `.state` / `.zip_code` | yes — copied at write time |

So editing a `locations` row leaves past bookings' **copied text** untouched while **`location_id` resolves to the new address**. Any screen reading the id sees the correction applied to an old job; any screen reading the copied columns sees the original.

**Whether that is a bug depends on which operation the customer is performing, and they are not the same thing:**

- **Correcting a typo** — the old text was *never right*. Propagating the correction is **desirable**. A dispatcher looking up an old job should see the correct street, not the typo.
- **Moving house** — the old address *was* right for those jobs. Propagating is **wrong**; it rewrites where past cleans happened.

The complaint that started this was "a customer who moves house can delete and re-add, but not correct a typo." So:

**Decision — SETTLED by the owner, 2026-07-30: typo correction only, edit in place, and it must not double as a move.**

The owner's framing, which is the clearest statement of it: *"a typo fixes a record that was always wrong, a move creates a new fact."*

Rationale: for a typo, in-place editing is correct and the propagation through `location_id` is a feature, not a leak. A move is a different operation and is already served, imperfectly, by add-new + set-primary. Conflating them would silently rewrite where past cleans happened.

Consequences the frontend must honour:
- Label it **"Correct this address"**, never "Edit" or "Change".
- Add helper text: *"Fixing a spelling mistake? Use this. Moved house? Add your new address instead."*
- Keep add-new visible alongside it, so the move path stays obvious.

### The move flow — deferred, not rejected

A first-class "I moved house" operation is **copy-on-write**, and the owner has specified the shape: insert a new `locations` row and set **`is_active = false`** on the old one (the column exists on `locations`). Past bookings keep pointing at the old row, so history stays intact on both the id and the snapshot.

**Explicitly deferred — do not build it now** (owner, 2026-07-30). Recorded here so the shape is not re-derived. It additionally needs the locations list to hide inactive rows, and a decision about what the customer sees for an address they no longer live at but which appears on past bookings.

---

## The prompt

```
Please add an address CORRECTION capability to the client portal. Two parts: a new
SQL function, and a new action in client-portal-api. Then deploy both.

INTENT AND SCOPE — read before implementing.

This is for correcting a mistake in an existing address (a misspelled street, a
wrong unit number). It is NOT for a customer who has moved house. That distinction
matters because bookings store BOTH a location_id AND a copied snapshot of the
address text. Editing a locations row in place means anything reading via
location_id shows the corrected address for past bookings — which is right for a
typo, and wrong for a move. The portal UI will label this "Correct this address"
and keep add-new separate. Please do not generalise it into a move.

PART 1 — new SQL function.

Model it on add_client_portal_location (migration 20260202150022:152-163), same
argument style and the same ownership check it performs:

CREATE OR REPLACE FUNCTION public.update_client_portal_location(
  p_client_user_id UUID,
  p_location_id    UUID,
  p_name           TEXT,
  p_address        TEXT,
  p_apt_suite      TEXT DEFAULT NULL,
  p_city           TEXT DEFAULT NULL,
  p_state          TEXT DEFAULT NULL,
  p_zip_code       TEXT DEFAULT NULL,
  p_latitude       NUMERIC DEFAULT NULL,
  p_longitude      NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public

Body requirements:

1. Resolve the caller's customer_id from client_portal_users where
   id = p_client_user_id AND is_active = true. If null, RETURN false.

2. OWNERSHIP CHECK — this is the important one. Verify the target location
   actually belongs to that customer BEFORE updating:

     IF NOT EXISTS (
       SELECT 1 FROM public.locations
       WHERE id = p_location_id AND customer_id = v_customer_id
     ) THEN
       RETURN false;
     END IF;

   Without this, any portal session could rewrite any customer's address in any
   org by passing an id — the same class of defect that made
   get_client_portal_user_data an enumeration primitive.

3. Require a non-empty p_name and p_address; RETURN false otherwise.

4. Update ONLY the address fields:

     UPDATE public.locations
     SET name = p_name,
         address = p_address,
         apt_suite = p_apt_suite,
         city = p_city,
         state = p_state,
         zip_code = p_zip_code,
         latitude = COALESCE(p_latitude, latitude),
         longitude = COALESCE(p_longitude, longitude),
         updated_at = NOW()
     WHERE id = p_location_id AND customer_id = v_customer_id;

   Do NOT touch is_primary — that has its own flow. Do NOT touch is_active,
   customer_id, organization_id, or price_override. price_override especially:
   it affects money and must never be writable from the portal.

   COALESCE on lat/long so a correction submitted without geocoding does not
   wipe coordinates the address already had.

5. RETURN FOUND.

Grants: follow the pattern in migration 20260715181351 — REVOKE ALL FROM PUBLIC,
anon, authenticated; GRANT EXECUTE TO service_role only. The portal reaches it
through the client-portal-api proxy, never directly.

PART 2 — new action in client-portal-api.

case "update_location": {
  - locationId from body (string, required).
  - name and address from body, trimmed, both required — err(..., 400) if missing.
  - apt_suite, city, state, zip_code, latitude, longitude optional.
  - p_client_user_id MUST come from the VERIFIED SESSION (portal_user_id), as
    every other case in this function does. Never from the body.
  - Call update_client_portal_location with those values.
  - If it returns false, return err("Could not update that address", 400) —
    do NOT distinguish "not yours" from "not found". Telling the caller which
    would confirm that a location id exists.
  - On true, return ok({ success: true }).
}

Place it next to the existing add_location / delete_location cases and match
their error handling.

PROHIBITIONS
- Do not add a delete or a set-primary path; both already exist.
- Do not make this able to change which customer or org a location belongs to.
- Do not backfill or alter bookings. The copied address text on past bookings is
  history and must stay as written.

Confirm BOTH the migration RAN and the function is DEPLOYED, not just committed.
```

---

## Frontend work this unblocks (not written yet)

`PortalProfileTab`, in the "My Addresses" list — currently `add_location` (`:146`), `delete_location` (`:196`) and set-primary (`:210-226`), with **no edit**.

1. A "Correct this address" affordance per row, alongside the existing delete icon.
2. An inline form prefilled from the row, reusing `AddressAutocomplete` (already imported) so a correction can carry fresh coordinates.
3. Helper text distinguishing correction from a move, per the decision above.
4. Call `invokePortal("client-portal-api", { body: { action: "update_location", locationId, ... } })`.

## Two pre-existing defects in the same section, NOT fixed by this

Found during the investigation and worth their own pass:

- **`handleSetDefault:213-222`** does two sequential direct anon `.update()`s on `locations` with no transaction. If the second fails after the first succeeds, the customer has **no primary address**.
- The same code reports success unconditionally. Anon `PATCH` on `locations` returns **204** (verified live), and a 0-row update is not an error in supabase-js — so if RLS blocks the write it toasts *"Default address updated"* while nothing changed.

Both argue for moving set-primary behind the proxy too, as a `set_primary_location` action, rather than writing the table directly from an anon browser session.
