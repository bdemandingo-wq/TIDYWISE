
# Client Portal Photo Journal

A visual history of every cleaning, captured by the cleaner at clock-out and surfaced to the client in their portal.

## Goals

1. **Cleaner is required to upload photos before clock-out is allowed.**
2. **Client sees a beautiful, chronological visual history per property** in the client portal.
3. Multi-tenant safe (org-scoped storage + RLS).

## Scope

### 1. Database (migration)

New table `booking_photos`:
- `id`, `booking_id` (fk), `organization_id`, `client_id`, `staff_id`, `storage_path`, `caption` (text, optional), `room_label` (text, optional, e.g. "Kitchen"), `photo_type` (`before` | `after` | `general`, default `after`), `taken_at`, `created_at`.
- Indexes on `(client_id, taken_at desc)` and `(booking_id)`.
- RLS:
  - Org admins/staff in same org: full access (scoped by `organization_id`).
  - Client portal session: SELECT own photos via existing `client_portal_sessions` mechanism (match `client_id`).

New storage bucket `booking-photos` (private):
- Path: `{organization_id}/{booking_id}/{uuid}.jpg`
- RLS: org members can read/write their org's folder; signed URLs served to client portal.

Optional org setting: `business_settings.require_clockout_photos` (boolean, default `true`) and `min_clockout_photos` (int, default 2).

### 2. Cleaner clock-out flow (mobile)

- Update the existing clock-out screen so the "Clock Out" button is **disabled** until at least N photos are uploaded for the active booking.
- Add a `BookingPhotoCapture` component:
  - Camera-first input (`capture="environment"`) with gallery fallback (Safari fix already in mem).
  - Optional room label dropdown + caption.
  - Uploads directly to `booking-photos` bucket; inserts row in `booking_photos`.
- Surface upload progress + thumbnails of what's already uploaded for the booking.

### 3. Client portal — Photo Journal page

- New route under existing client portal (e.g. `/portal/journal` or tab inside the booking history view).
- Components:
  - `PhotoJournalTimeline` — grouped by booking date, header shows date + staff name + service.
  - `PhotoGalleryGrid` — responsive grid (mobile: 2 cols, desktop: 3-4), tap → lightbox.
  - `PhotoLightbox` — full-screen swipeable viewer with caption + room label.
- Empty state with friendly copy ("Your visual history will appear here after your next cleaning").
- Pulls signed URLs via an edge function (`get-client-photo-urls`) so private bucket stays private.

### 4. Admin dashboard

- Lightweight tab on the booking detail page showing the photos uploaded for that booking (so owners can audit).
- No new top-level admin page in this pass.

## Technical Details

- **Storage**: private bucket, signed URLs (1 hr TTL) generated server-side for client portal.
- **Edge function `get-client-photo-urls`**: validates client portal session, returns signed URLs for that client only.
- **Clock-out enforcement**: client-side gate + server-side check in the clock-out RPC (reject if `require_clockout_photos` is true and photo count < min).
- **Multi-tenant**: every query scoped by `organization_id`; storage path enforces org isolation via `(storage.foldername(name))[1]`.
- **Realtime**: optionally subscribe client portal to `booking_photos` inserts so journal updates live (nice-to-have, can defer).

## Out of scope (this pass)

- Before/after side-by-side comparison UI.
- AI auto-captioning / room detection.
- Client commenting / reactions on photos.
- Email/SMS notifications when new photos drop (can add later).

## Deliverables

1. Migration: `booking_photos` table + RLS + `booking-photos` bucket + bucket policies + business_settings columns.
2. Cleaner UI: photo capture component + clock-out gate.
3. Client portal: Photo Journal tab/page + lightbox.
4. Edge function: `get-client-photo-urls`.
5. Admin booking detail: photos sub-tab.
