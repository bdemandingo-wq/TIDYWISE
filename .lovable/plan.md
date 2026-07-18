# Mobile QA Batch Plan

23 fixes grouped into 8 work streams. I'll implement in this order; each group is independently shippable.

## 1. Booking form + list (items 1–4)
- `BookingStepper.tsx` — button state machine: single primary Save with spinner-in-place; separate Draft button; disable both while saving; verify draft path actually calls the `is_draft=true` insert branch and invalidates the Drafts query key.
- `BookingsPage.tsx` / status chip renderer — when `status === 'cancelled'`, render only the CANCELLED chip; suppress cleaning/payment chips.
- Booking action sheet (mobile) — add destructive "Delete Booking" row with AlertDialog confirm, calls existing delete mutation.
- `SchedulerCalendar` mobile day cell — if `bookings.length >= 2`, tapping opens a bottom-sheet list of that day's bookings; selecting one opens the existing action sheet.

## 2. AI chat / Ask TidyWise (items 5–8, 16 partial)
- Chat input container: switch to `dvh`-based flex layout with `env(safe-area-inset-bottom)` + `visualViewport` listener so the composer sticks above the iOS keyboard.
- Send handler: guard with `isSending` ref + disable submit button and suggested-prompt buttons while `status !== 'idle'`.
- Error mapping: intercept 402 `daily_limit_reached` and generic non-2xx → show branded "Out of AI credits" toast with action button opening `BuyAiCreditsButton` flow. Fallback: friendly generic message, never raw "Edge Function returned…".
- Credits meter: after each successful/failed AI call, `queryClient.invalidateQueries(['ai-credit-status'])`; also lower `staleTime` and subscribe to a lightweight event bus fired by the chat hook.

## 3. Live Tracking settings (items 9–10)
- Wire the 3 toggles to `business_settings` columns (`live_tracking_include_eta_sms`, `notify_client_on_arrival`, `notify_admin_on_arrival`) — add migration if missing, update mutation, and gate the corresponding edge-function paths (`send-on-the-way-sms`, `send-arrival-sms`) on those flags.
- Completed Routes: fix query — currently filtering by `status='completed'` on wrong table or missing `organization_id`; verify against `bookings` + `cleaner_location_tracking` and show today's completed jobs in org timezone.

## 4. Sidebar badges (item 11)
- `useSidebarBadgesFull` — Scheduler badge should count only actionable pending items (not all today's bookings). Recheck the query filter; suppress badge when count is 0.

## 5. Customer → Book prefill (item 12)
- Customer profile "Book" button navigates to `/dashboard/bookings?new=1&customerId=…`; `AddBookingDialog` reads that param and seeds the form with name/phone/email/address.

## 6. Invoices (items 13–15)
- Line item component: `Number(qty) * Number(price)` with proper `parseFloat`, guard NaN → 0; recompute totals on each keystroke.
- Send button: same loading-state pattern as booking Save (single button, spinner replaces label).
- Recipients: add tag-style additional-emails input to Send dialog; pass `additionalRecipients: string[]` to `send-invoice` edge fn and include as `cc`.

## 7. Error handling + Leads (items 16, 17)
- Introduce/extend `parseEdgeFunctionErrorDetailed` mapping for `daily_limit_reached`, `leads_status_check`, and generic `non-2xx`; wire all `toast.error(err.message)` sites in AI + leads + invoices to use the parser. Audit remaining sites via `rg "non-2xx|error.message"` and swap.
- Check `leads_status_check` DB constraint; identify which status value is being sent that's not in the enum, either add missing value via migration or fix the client-side value.
- Leads mobile card "…" menu: add Delete with confirmation, matches desktop menu items.

## 8. Mobile styling + modal footer + automation + analytics (items 18–23)
- Services page tab bar: wrap in `overflow-x-auto scrollbar-none` with `whitespace-nowrap` triggers; ensure `-mx-4 px-4` bleed.
- Global input styling: audit `src/components/ui/input.tsx` / `textarea.tsx` dark-mode tokens; ensure `bg-background text-foreground border-input` and remove any hardcoded overrides in Add Staff modal.
- Sticky modal footer rule: create `<DialogFooter className="sticky bottom-0 …">` pattern; apply to Add Staff modal + audit other affected modals.
- Automation Center mobile: root-cause the empty state — likely a conditional query gated on desktop-only filter state. Fix so `useAutomations()` returns the same rows on mobile.
- Suggestions "Configure SMS": change route to `/dashboard/settings?section=sms` (or existing anchor) and ensure Settings page scrolls to that section.
- User Activity Tracking page: responsive header (stack on `<md`), badges use `flex-wrap` and `text-xs`, tighten padding, ensure contrast via semantic tokens.

## Verification
- Playwright at 390×844 viewport: booking flow (save + draft), AI chat with keyboard focus, invoice totals, services tabs scroll, staff modal save reachability.
- Read console/network for the AI 402 path and confirm the branded toast fires.
- Cross-check no desktop regressions via a 1440 viewport screenshot pass on the touched pages.

## Assumptions I'll make unless told otherwise
- `business_settings` is the right home for the 3 live-tracking flags (matches existing pattern).
- The AI credits purchase flow is `BuyAiCreditsButton` and I'll reuse it in the toast action.
- Draft bookings failure is a query/invalidation issue rather than a missing column — I'll confirm on read.
- For the leads constraint, I'll adjust the client to send a valid enum value; if the intent is a new status, I'll add it to the check constraint via migration.

If you want me to split delivery (e.g. ship groups 1–4 first, then the rest), say so; otherwise I'll proceed top-to-bottom.
