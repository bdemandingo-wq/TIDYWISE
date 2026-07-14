
# Scheduling Mode Settings — Specifications

## 1. Overview

A new **Scheduling Mode** section in **Settings → Booking** lets the org owner/manager choose how appointment times are presented on both the admin "New Booking" form and the public customer booking form.

Two mutually exclusive modes:

- **Specific Time Slots** (current behavior) — customer/admin picks an exact start time (e.g. `9:00 AM`) from the org's availability grid.
- **Arrival Windows** — customer/admin picks a *block* (e.g. `8:00 AM – 10:00 AM`); the actual service start is flexible within that window and confirmed later by the assigned cleaner's ETA.

Whatever is saved here is the single source of truth. Both booking surfaces read it on load — no per-form toggle.

---

## 2. Data model

New columns on `business_settings` (org-scoped, one row per org):

| Column | Type | Default | Notes |
|---|---|---|---|
| `scheduling_mode` | `text` (`'specific' \| 'arrival_window'`) | `'specific'` | Enforced by CHECK constraint. |
| `arrival_windows` | `jsonb` | `[]` | Array of window objects (see below). Only used when mode = `arrival_window`. |

Window object shape:
```json
{
  "id": "uuid",
  "label": "Morning",           // optional friendly label
  "start_time": "08:00",        // 24h HH:MM, org timezone
  "end_time":   "10:00",
  "sort_order": 0,
  "enabled":    true
}
```

Duration is derived (`end_time - start_time`), not stored, so edits stay consistent.

RLS: same policies as the rest of `business_settings` — read/write scoped to org owners/managers via `has_role`.

---

## 3. Settings Panel — wireframe

Location: **Settings → Booking → Scheduling Mode** (new card, above existing "Business Hours").

```text
┌─────────────────────────────────────────────────────────────┐
│  Scheduling Mode                                            │
│  How customers pick a time when they book.                  │
│                                                             │
│  ( • ) Specific Time Slots                                  │
│         Customers see exact start times pulled from your    │
│         availability (e.g. 9:00 AM, 9:30 AM, 10:00 AM).     │
│                                                             │
│  ( ) Arrival Windows                                        │
│         Customers pick a time block. Your team arrives      │
│         anytime within the window.                          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  ARRIVAL WINDOWS                     [ + Add Window ]       │
│  (visible only when Arrival Windows is selected)            │
│                                                             │
│   ┌────────────────────────────────────────────────────┐    │
│   │ ⋮⋮  Morning        08:00 AM  →  10:00 AM   (2h)  ✏ 🗑 │   │
│   ├────────────────────────────────────────────────────┤    │
│   │ ⋮⋮  Midday         12:00 PM  →  02:00 PM   (2h)  ✏ 🗑 │   │
│   ├────────────────────────────────────────────────────┤    │
│   │ ⋮⋮  Afternoon      03:00 PM  →  05:00 PM   (2h)  ✏ 🗑 │   │
│   └────────────────────────────────────────────────────┘    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  CUSTOMER PREVIEW                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 08:00 AM –  │  │ 12:00 PM –  │  │ 03:00 PM –  │          │
│  │ 10:00 AM    │  │ 02:00 PM    │  │ 05:00 PM    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                             │
│                                        [ Cancel ]  [ Save ] │
└─────────────────────────────────────────────────────────────┘
```

Mobile: same content, single column, 44px touch targets, drag handle on the left of each window row.

---

## 4. Field & interaction spec

### 4.1 Mode selector
- Radio group, two options. Persisted on Save.
- Switching from Arrival Windows → Specific keeps saved windows in DB (soft) so switching back doesn't wipe config.

### 4.2 Add Window
- Button `+ Add Window` opens an inline row (or bottom sheet on mobile) with:
  - **Label** — text, optional, max 40 chars (`"Morning"`, `"Evening"`, etc.)
  - **Start time** — time picker, 15-min step, org timezone
  - **End time** — time picker, 15-min step, must be > start
  - **Duration** — read-only, auto-computed and shown as `2h 0m`
- Validation on save:
  - `end_time > start_time`
  - Overlap check across enabled windows → warning ("This overlaps with *Morning*"), not a hard block (some orgs want overlapping blocks).
  - Min duration 30 min, max 12 h.

### 4.3 Edit / Delete
- Pencil icon → same inline editor prefilled.
- Trash icon → confirm dialog ("Delete window? Existing bookings that reference it keep their original time."). Historical bookings are never mutated.

### 4.4 Reorder
- Drag handle (`⋮⋮`) reorders windows. `sort_order` is persisted. This is the exact order customers see them.

### 4.5 Enable / disable
- Optional per-row toggle for temporarily hiding a window without deleting.

### 4.6 Save behavior
- Single **Save** button at the bottom persists mode + full window array in one write.
- Optimistic update + toast. Cache invalidated for `useBookingSettings` and `usePublicOrgPricing`.

### 4.7 Preview
- Live-renders the exact chip UI the customer will see (mirrors the reference screenshot).
- If mode = Specific, preview shows a mocked time strip (`9:00 AM`, `9:30 AM`, `10:00 AM …`) with a note "Actual times depend on availability".

---

## 5. Propagation to booking forms

Both forms read one shared hook, `useSchedulingMode(orgId)` (returns `{ mode, windows }`), which selects from `business_settings`.

### 5.1 Public customer booking form (`PublicBookingPage.tsx`)
- **Specific**: unchanged — renders the current 30-minute time grid from availability.
- **Arrival Window**: replaces the time grid with a chip list of enabled windows, sorted by `sort_order`. Only windows that still have capacity for the chosen date are enabled; others render disabled with tooltip "Fully booked".
  - On submit, the booking is created with:
    - `start_time` = window `start_time`
    - `arrival_window_start` / `arrival_window_end` = window bounds
    - `is_arrival_window = true`
  - Confirmation email/SMS template automatically swaps `{{start_time}}` for `{{arrival_window_start}} – {{arrival_window_end}}` when `is_arrival_window`.

### 5.2 Admin booking form (`AddBookingDialog` / `BookingStepper`)
- Same shared hook; the "Date & Time" step renders the matching UI.
- Admins in Arrival Window mode also get a secondary "Exact start (optional)" time field so an admin can pin a precise start for internal scheduling while the customer still sees the window.

### 5.3 Scheduler & communications
- Scheduler shows the window range in the booking card when `is_arrival_window = true`, and uses `arrival_window_start` for grid positioning.
- Reminder SMS: on the day-before reminder we send the window; the "On My Way" SMS from the cleaner already sends the exact ETA, so the flexible-start UX works end-to-end.

---

## 6. Workflow — happy path

1. Admin opens **Settings → Booking → Scheduling Mode**.
2. Selects **Arrival Windows**.
3. Clicks **+ Add Window** three times, entering `08:00–10:00 Morning`, `12:00–14:00 Midday`, `15:00–17:00 Afternoon`.
4. Drags to reorder; toggles a window off; edits Midday to `12:00–14:30`.
5. Reviews the **Customer Preview** section (chips render live).
6. Clicks **Save** → toast "Scheduling updated". `business_settings.scheduling_mode` and `arrival_windows` persisted.
7. Next visit to `/book` (public form) and `New Booking` (admin) both render the chip picker — zero extra config.

---

## 7. Edge cases & rules

- Switching modes never mutates existing bookings.
- Deleting a window keeps historical bookings intact (stored fields are already denormalized onto the booking row).
- If mode = `arrival_window` but zero enabled windows exist, both forms fall back to Specific Time Slots and the Settings card shows a red banner: "Arrival Windows mode is on but no windows are configured — customers are seeing exact times."
- Availability logic (staff schedules, blackouts, capacity) is unchanged; it just gates *which windows are selectable* on a given day.
- Timezone: all times stored as `HH:MM` and interpreted in the org's `business_settings.timezone`.

---

## 8. Out of scope (for this pass)

- Per-service scheduling modes (all services share the org mode).
- Per-day different windows (v2 — could add `days_of_week: number[]` on each window).
- Dynamic pricing per window.

---

Confirm this direction and I'll implement it — migration + `SchedulingModeCard` settings component + shared `useSchedulingMode` hook + wiring in the public and admin booking forms.
