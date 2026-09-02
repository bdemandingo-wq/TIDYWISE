# iOS Home Screen Widget — Next Upcoming Booking

**Date:** 2026-09-02
**Platform:** iOS only (WidgetKit)
**Widget size:** `.systemSmall` (2x2, space of 4 app icons)
**Approach:** Manual data bridge — Capacitor app writes to shared App Group, widget reads cached data

---

## Purpose

A home screen widget that reminds the user to open TidyWise by showing their next upcoming booking at a glance. When no bookings exist, it nudges them to tap and schedule one.

## Data Flow

```
App opens / booking changes → fetch next booking from Supabase → write JSON to App Group UserDefaults
Widget timeline fires (every 15 min) → read App Group UserDefaults → render SwiftUI view
```

### Shared App Group

- Identifier: `group.com.TidyWiseApp.app`
- Storage key: `widgetNextBooking`
- JSON schema:

```json
{
  "bookingId": "uuid",
  "customerName": "Jane Smith",
  "serviceType": "Deep Clean",
  "address": "123 Oak St",
  "scheduledAt": "2026-09-02T14:00:00Z",
  "isEmpty": false
}
```

When no upcoming booking exists:

```json
{
  "isEmpty": true
}
```

## Capacitor Side (React/TypeScript)

### Custom Capacitor Plugin: `WidgetBridge`

A minimal native bridge with a single method:

```typescript
WidgetBridge.syncBookingData({ json: string }): Promise<void>
```

The Swift side (~20 lines):
1. Writes the JSON string to the App Group UserDefaults under key `widgetNextBooking`
2. Calls `WidgetCenter.shared.reloadAllTimelines()` to trigger a widget refresh

### `syncWidgetData()` Utility

A new TypeScript function that:

1. Queries Supabase: next booking where `scheduled_at > now()` and `status` is not `cancelled`, ordered by `scheduled_at ASC`, limit 1
2. Extracts `bookingId`, `customerName`, `serviceType`, `address`, `scheduledAt`
3. Serializes to JSON (or `{ isEmpty: true }` if no results)
4. Calls `WidgetBridge.syncBookingData()` with the JSON

### Trigger Points

- On app launch (in existing initialization flow)
- After a booking is created, updated, or cancelled

## WidgetKit Extension (Swift/SwiftUI)

### Xcode Target

- Name: `TidyWiseWidget`
- Bundle ID: `com.TidyWiseApp.app.widget`
- Supported families: `.systemSmall` only

### Timeline Provider

- Reads `widgetNextBooking` from App Group UserDefaults
- Parses the JSON into a `BookingEntry` struct
- Returns current entry + schedules next refresh in 15 minutes
- Falls back to empty-state entry if no data or `isEmpty: true`

### Widget View

**With booking:**

```
+---------------------+
|  Today, 2:00 PM     |
|  Jane Smith          |
|  Deep Clean          |
|  123 Oak St          |
+---------------------+
```

- Line 1: Relative date/time (e.g., "Today, 2:00 PM", "Tomorrow, 9:00 AM")
- Line 2: Customer name
- Line 3: Service type
- Line 4: Address (truncated if long)

**Empty state:**

```
+---------------------+
|                      |
|   Tap to schedule    |
|                      |
+---------------------+
```

### Styling

- TidyWise brand colors for background/accent
- SF Pro system font for readability
- Clean layout with consistent padding

## Deep Linking

| Widget State | Tap URL | App Destination |
|---|---|---|
| Booking shown | `tidywise://booking/{bookingId}` | Booking detail view |
| Empty state | `tidywise://new-booking` | New booking creation |

The Capacitor app adds a URL scheme listener to route these deep links to the correct screen.

## What This Does NOT Include

- Android widget (future work)
- Push-triggered refresh (can be added later if staleness is an issue)
- Multiple widget sizes (only `.systemSmall`)
- Widget configuration/intent (no user-customizable options)

## Testing Plan

1. Verify App Group data writes correctly on app launch
2. Verify widget reads and renders booking data
3. Verify empty state renders when no bookings exist
4. Verify widget refreshes after booking create/update/cancel
5. Verify deep link opens correct screen on tap
6. Verify 15-minute timeline refresh cycle
7. Test with long customer names and addresses (truncation)
