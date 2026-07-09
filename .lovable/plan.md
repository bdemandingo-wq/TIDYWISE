Two features shipped together. Both are org-scoped, RLS-enforced, and reuse existing notification/loyalty infrastructure.

---

## 1) Time-Off Request System

### Database (migration)
- New table `public.time_off_requests`:
  - `id uuid pk`, `organization_id uuid not null`, `staff_id uuid not null → staff(id)`
  - `start_date date not null`, `end_date date not null` (trigger: end >= start)
  - `reason text`, `status text not null default 'pending'` check in (pending, approved, denied)
  - `admin_note text`, `reviewed_by uuid`, `reviewed_at timestamptz`
  - `created_at`, `updated_at` (+ trigger)
- GRANTs: SELECT/INSERT/UPDATE/DELETE to authenticated; ALL to service_role.
- RLS:
  - Staff can INSERT own (`staff_id` maps to their `staff` row via `user_id = auth.uid()`).
  - Staff can SELECT own.
  - Org owners/admins (via `has_role` / `org_memberships`) can SELECT + UPDATE rows in their org.
- On approval trigger (`AFTER UPDATE ... WHEN status → approved`): insert blocked date rows into existing staff availability table (`cleaner_availability` / equivalent — will inspect at implementation) covering start→end range so scheduler filters exclude them.
- Realtime: add table to `supabase_realtime` publication.

### Staff portal — "Time Off" tab
- New component `src/components/staff/TimeOffRequests.tsx`:
  - Form: date range picker (start, end), reason textarea, submit.
  - History list: date range, status badge (pending/approved/denied), admin note if any.
- Wire into staff portal navigation.

### Admin — Time Off Requests panel
- New page/tab under Staff management: `src/components/admin/TimeOffRequestsPanel.tsx`.
- List pending first, then history. Each row: staff name, dates, reason, Approve / Deny buttons + optional admin_note textarea.
- Sidebar/nav badge showing pending count (org-scoped query).

### Notifications
- New edge function `notify-time-off-request`:
  - On INSERT → email + push to org admins ("New time-off request from {staff}").
  - On UPDATE (status change) → push + email to staff ("Your time-off request was {approved/denied}").
- Triggered via DB webhook OR called directly from the mutation handlers (simpler + auth-aware) — will call from client mutation.
- Uses `sendOrgEmail` shared helper + `sendPushToOrg` / staff push equivalent.

---

## 2) Loyalty Tier Notifications

### Tier computation
- Reuse existing `customer_loyalty` + `client_tier_settings`. Add helper `src/lib/loyaltyTier.ts`:
  - `getCurrentTier(points/cleans, tiers)`, `getNextTier(...)`, `getProgressToNext(...)` returning `{ current, next, cleansAway, pointsAway }`.

### Customer portal banners
- New component `src/components/portal/LoyaltyTierBanner.tsx` shown on portal dashboard:
  - If within 1 clean OR ≤ threshold points of next tier: "You're 1 clean away from {NextTier}".
  - If just reached a new tier (compare stored `last_notified_tier` vs current): congratulations banner + update `last_notified_tier`.
- Booking/checkout view (`PortalBookingRequestForm` or public booking checkout): when the customer's active tier grants a discount that maps into the recurring-discount pipeline, show "This clean is X% off — {Tier} reward applied" using the resolved percentage from existing `recurringDiscount.ts` logic.

### Admin notifications on tier-up
- Extend the loyalty-points award path (currently in booking-completion flow — likely edge function `award-loyalty-points` or similar; will grep at implementation).
- After incrementing points/cleans, compute prev vs new tier. If tier changed upward:
  - Insert into `admin_system_notifications` (bell) for org admins.
  - Fire `sendPushToOrg(org, "Loyalty tier reached", "{Customer} reached {Tier}")`.
- Add `customer_loyalty.current_tier text` + `last_tier_notified_at timestamptz` columns to store transitions (migration piece).

---

## Deliverables order
1. Migration (time_off_requests + loyalty tier columns + availability-block trigger + realtime).
2. Staff portal Time Off UI.
3. Admin Time Off panel + pending badge.
4. `notify-time-off-request` edge function + wiring.
5. Loyalty tier helper + portal banner + checkout discount label.
6. Admin tier-up notification hook in booking-completion path.

Confirm to proceed and I'll implement in that order.
