# iOS Home Screen Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2x2 iOS home screen widget showing the next upcoming booking (customer name, service type, time, address), with an empty-state "Tap to schedule" nudge.

**Architecture:** The Capacitor app writes the next booking as a JSON blob to a shared App Group UserDefaults on launch and after booking mutations. A native WidgetKit extension reads that cached data and renders it with SwiftUI on a 15-minute timeline refresh. Tapping the widget deep-links into the app.

**Tech Stack:** Swift/SwiftUI (WidgetKit extension), TypeScript/React (Capacitor plugin bridge), Capacitor 8 custom plugin, Xcode App Groups

## Global Constraints

- Bundle ID: `com.TidyWiseApp.app` (widget: `com.TidyWiseApp.app.widget`)
- Development Team: `JV99ZGTGR3`, automatic signing
- iOS project uses SPM, not CocoaPods — no Podfile, no xcworkspace
- Xcode project path: `ios/App/App.xcodeproj`
- Supabase client: always import from `@/lib/supabase`, never create a new one
- Data hooks live in `src/hooks/`, utilities in `src/lib/`
- Widget only supports `.systemSmall` (2x2)
- App Group identifier: `group.com.TidyWiseApp.app`
- Existing URL schemes: `com.TidyWiseApp.app` (OAuth callback), Google OAuth — a new `tidywise` scheme is needed for widget deep links
- Primary brand color: HSL 230 100% 50% (vibrant blue, `#0000FF` equivalent)
- Timeline refresh: 15 minutes
- The `appUrlOpen` listener in `src/lib/nativeOAuth.ts` currently only handles `auth/callback` URLs — widget deep links need a new handler

---

### Task 1: Create the WidgetBridge Capacitor Plugin (Swift native side)

**Files:**
- Create: `ios/App/App/WidgetBridgePlugin.swift`
- Create: `ios/App/App/WidgetBridgePlugin.m` (Objective-C bridge for Capacitor plugin registration)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: A Capacitor plugin registered as `WidgetBridge` with method `syncBookingData(call: CAPPluginCall)` that accepts `{ json: string }`, writes it to the App Group UserDefaults key `widgetNextBooking`, and calls `WidgetCenter.shared.reloadAllTimelines()`.

- [ ] **Step 1: Create the Swift plugin file**

Create `ios/App/App/WidgetBridgePlugin.swift`:

```swift
import Capacitor
import WidgetKit

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncBookingData", returnType: CAPPluginReturnPromise)
    ]

    @objc func syncBookingData(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Missing 'json' parameter")
            return
        }

        guard let defaults = UserDefaults(suiteName: "group.com.TidyWiseApp.app") else {
            call.reject("Could not access App Group UserDefaults")
            return
        }

        defaults.set(json, forKey: "widgetNextBooking")

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve()
    }
}
```

- [ ] **Step 2: Create the Objective-C registration bridge**

Create `ios/App/App/WidgetBridgePlugin.m`:

```objc
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WidgetBridgePlugin, "WidgetBridge",
    CAP_PLUGIN_METHOD(syncBookingData, CAPPluginReturnPromise);
)
```

- [ ] **Step 3: Add App Group entitlement to the main app**

Edit `ios/App/App/App.entitlements` — add the App Group capability:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.TidyWiseApp.app</string>
    </array>
</dict>
</plist>
```

**Note:** The App Group must also be enabled in the Apple Developer portal under the app's Capabilities. This is a manual step in Xcode or the developer portal — Xcode with automatic signing will prompt to create it.

- [ ] **Step 4: Verify the plugin compiles**

```bash
cd /Users/emmanuelforkuoh/jointidywise/ios/App
xcodebuild -project App.xcodeproj -scheme App -destination 'generic/platform=iOS' build 2>&1 | tail -5
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 5: Commit**

```bash
git add ios/App/App/WidgetBridgePlugin.swift ios/App/App/WidgetBridgePlugin.m ios/App/App/App.entitlements
git commit -m "feat(ios): add WidgetBridge Capacitor plugin for App Group data sync"
```

---

### Task 2: Create the TypeScript sync utility and plugin definition

**Files:**
- Create: `src/lib/widgetBridge.ts`
- Create: `src/lib/syncWidgetData.ts`

**Interfaces:**
- Consumes: `WidgetBridgePlugin` (Task 1) via Capacitor's `registerPlugin`
- Produces: `syncWidgetData(): Promise<void>` — fetches the next upcoming booking from Supabase and writes it to the native widget bridge. Called by Task 3.

- [ ] **Step 1: Create the Capacitor plugin definition**

Create `src/lib/widgetBridge.ts`:

```typescript
import { registerPlugin } from '@capacitor/core';

export interface WidgetBridgePlugin {
  syncBookingData(options: { json: string }): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

export default WidgetBridge;
```

- [ ] **Step 2: Create the sync utility**

Create `src/lib/syncWidgetData.ts`:

```typescript
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import WidgetBridge from '@/lib/widgetBridge';

interface WidgetBookingData {
  bookingId: string;
  customerName: string;
  serviceType: string;
  address: string;
  scheduledAt: string;
  isEmpty: false;
}

interface WidgetEmptyData {
  isEmpty: true;
}

type WidgetData = WidgetBookingData | WidgetEmptyData;

export async function syncWidgetData(): Promise<void> {
  // Only runs on native iOS — widgets don't exist on web
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return;
  }

  try {
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        scheduled_at,
        address,
        customer:customers!inner(first_name, last_name),
        service:services(name)
      `)
      .neq('status', 'cancelled')
      .gt('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Widget sync: failed to fetch next booking', error);
      return;
    }

    let widgetData: WidgetData;

    if (booking && booking.customer) {
      const customer = booking.customer as { first_name: string; last_name: string };
      const service = booking.service as { name: string } | null;

      widgetData = {
        bookingId: booking.id,
        customerName: `${customer.first_name} ${customer.last_name}`.trim(),
        serviceType: service?.name ?? 'Cleaning',
        address: booking.address ?? '',
        scheduledAt: booking.scheduled_at,
        isEmpty: false,
      };
    } else {
      widgetData = { isEmpty: true };
    }

    await WidgetBridge.syncBookingData({ json: JSON.stringify(widgetData) });
  } catch (err) {
    // Non-fatal — the widget just shows stale data
    console.error('Widget sync failed:', err);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/emmanuelforkuoh/jointidywise
npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20
```

Expected: no errors related to the new files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/widgetBridge.ts src/lib/syncWidgetData.ts
git commit -m "feat: add syncWidgetData utility for iOS widget data bridge"
```

---

### Task 3: Wire sync calls into app lifecycle and booking mutations

**Files:**
- Modify: `src/hooks/useAppStateHandler.ts` (add sync on app resume, ~line 205)
- Modify: `src/hooks/useBookings.ts` (add sync after booking mutations)

**Interfaces:**
- Consumes: `syncWidgetData()` from `src/lib/syncWidgetData.ts` (Task 2)
- Produces: Widget data is kept up-to-date via app lifecycle events and booking mutations

- [ ] **Step 1: Add widget sync on app resume**

In `src/hooks/useAppStateHandler.ts`, import `syncWidgetData` at the top:

```typescript
import { syncWidgetData } from '@/lib/syncWidgetData';
```

Inside the native Capacitor `appStateChange` listener (around line 205-206), after `queryClient.invalidateQueries()`, add the sync call:

```typescript
const resumeListener = await App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) {
        queryClient.invalidateQueries();
        syncWidgetData(); // fire-and-forget, non-blocking
        try {
```

- [ ] **Step 2: Add widget sync after booking mutations in useBookings**

In `src/hooks/useBookings.ts`, import `syncWidgetData` at the top:

```typescript
import { syncWidgetData } from '@/lib/syncWidgetData';
```

Find the booking mutation `onSuccess` callbacks (create, update, and delete mutations). In each `onSuccess`, after the `queryClient.invalidateQueries` calls, add:

```typescript
syncWidgetData(); // Update widget with latest booking
```

There are typically three mutations in this file: `createBooking`, `updateBooking`, and `deleteBooking`. Add the call to each one's `onSuccess`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/emmanuelforkuoh/jointidywise
npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAppStateHandler.ts src/hooks/useBookings.ts
git commit -m "feat: sync widget data on app resume and booking mutations"
```

---

### Task 4: Create the WidgetKit Extension (Swift/SwiftUI)

**Files:**
- Create: `ios/TidyWiseWidget/TidyWiseWidget.swift` (entry point, timeline provider, views)
- Create: `ios/TidyWiseWidget/Info.plist`
- Create: `ios/TidyWiseWidget/TidyWiseWidget.entitlements`
- Create: `ios/TidyWiseWidget/Assets.xcassets/` (widget preview assets)
- Modify: `ios/App/App.xcodeproj/project.pbxproj` (add widget target — done via Xcode)

**Interfaces:**
- Consumes: App Group `group.com.TidyWiseApp.app`, key `widgetNextBooking` (written by Task 1's plugin)
- Produces: A `.systemSmall` widget visible on the iOS home screen

**Important:** The widget extension target must be added in Xcode. Steps 1-3 create the source files; Step 4 covers the Xcode project setup.

- [ ] **Step 1: Create the widget Swift source**

Create directory `ios/TidyWiseWidget/` and file `ios/TidyWiseWidget/TidyWiseWidget.swift`:

```swift
import WidgetKit
import SwiftUI

// MARK: - Data Model

struct BookingData: Codable {
    let bookingId: String?
    let customerName: String?
    let serviceType: String?
    let address: String?
    let scheduledAt: String?
    let isEmpty: Bool
}

struct BookingEntry: TimelineEntry {
    let date: Date
    let booking: BookingData
}

// MARK: - Timeline Provider

struct BookingTimelineProvider: TimelineProvider {
    private let appGroupID = "group.com.TidyWiseApp.app"
    private let storageKey = "widgetNextBooking"

    func placeholder(in context: Context) -> BookingEntry {
        BookingEntry(
            date: Date(),
            booking: BookingData(
                bookingId: "preview",
                customerName: "Jane Smith",
                serviceType: "Deep Clean",
                address: "123 Oak St",
                scheduledAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600)),
                isEmpty: false
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (BookingEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BookingEntry>) -> Void) {
        let entry = loadEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> BookingEntry {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let jsonString = defaults.string(forKey: storageKey),
              let jsonData = jsonString.data(using: .utf8),
              let booking = try? JSONDecoder().decode(BookingData.self, from: jsonData) else {
            return BookingEntry(date: Date(), booking: BookingData(
                bookingId: nil, customerName: nil, serviceType: nil,
                address: nil, scheduledAt: nil, isEmpty: true
            ))
        }
        return BookingEntry(date: Date(), booking: booking)
    }
}

// MARK: - Widget Views

struct TidyWiseWidgetEntryView: View {
    var entry: BookingEntry

    // TidyWise brand blue: HSL 230 100% 50%
    private let brandBlue = Color(red: 0.0, green: 0.0, blue: 1.0)
    private let brandBlueDark = Color(red: 0.1, green: 0.1, blue: 0.85)

    var body: some View {
        if entry.booking.isEmpty {
            emptyStateView
        } else {
            bookingView
        }
    }

    private var bookingView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(formattedDate)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.white.opacity(0.9))

            Text(entry.booking.customerName ?? "Unknown")
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .lineLimit(1)

            Text(entry.booking.serviceType ?? "Cleaning")
                .font(.caption)
                .foregroundColor(.white.opacity(0.85))
                .lineLimit(1)

            Spacer()

            Text(entry.booking.address ?? "")
                .font(.caption2)
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            LinearGradient(
                gradient: Gradient(colors: [brandBlue, brandBlueDark]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .widgetURL(URL(string: "tidywise://booking/\(entry.booking.bookingId ?? "")"))
    }

    private var emptyStateView: some View {
        VStack(spacing: 8) {
            Image(systemName: "calendar.badge.plus")
                .font(.title)
                .foregroundColor(.white.opacity(0.8))

            Text("Tap to schedule")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(
                gradient: Gradient(colors: [brandBlue, brandBlueDark]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .widgetURL(URL(string: "tidywise://new-booking"))
    }

    private var formattedDate: String {
        guard let isoString = entry.booking.scheduledAt,
              let date = ISO8601DateFormatter().date(from: isoString) else {
            return ""
        }

        let calendar = Calendar.current
        let formatter = DateFormatter()
        formatter.timeStyle = .short

        if calendar.isDateInToday(date) {
            return "Today, \(formatter.string(from: date))"
        } else if calendar.isDateInTomorrow(date) {
            return "Tomorrow, \(formatter.string(from: date))"
        } else {
            formatter.dateStyle = .short
            return formatter.string(from: date)
        }
    }
}

// MARK: - Widget Configuration

@main
struct TidyWiseWidget: Widget {
    let kind: String = "TidyWiseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BookingTimelineProvider()) { entry in
            TidyWiseWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Next Booking")
        .description("See your next upcoming booking at a glance.")
        .supportedFamilies([.systemSmall])
    }
}
```

- [ ] **Step 2: Create the widget entitlements**

Create `ios/TidyWiseWidget/TidyWiseWidget.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.TidyWiseApp.app</string>
    </array>
</dict>
</plist>
```

- [ ] **Step 3: Create the widget Info.plist**

Create `ios/TidyWiseWidget/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>TidyWise Widget</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 4: Add the widget target in Xcode**

This step must be done in Xcode GUI:

1. Open `ios/App/App.xcodeproj` in Xcode
2. File → New → Target → Widget Extension
3. Product Name: `TidyWiseWidget`
4. Bundle Identifier: `com.TidyWiseApp.app.widget`
5. **Uncheck** "Include Configuration App Intent" (we use `StaticConfiguration`)
6. **Delete** the auto-generated Swift files Xcode creates — replace them with the files from Steps 1-3
7. In the widget target's "Signing & Capabilities":
   - Team: `JV99ZGTGR3` (automatic signing)
   - Add "App Groups" capability → select `group.com.TidyWiseApp.app`
8. Set the widget target's entitlements file to `TidyWiseWidget.entitlements`
9. Ensure the widget target's deployment target matches the main app

- [ ] **Step 5: Verify the widget target builds**

```bash
cd /Users/emmanuelforkuoh/jointidywise/ios/App
xcodebuild -project App.xcodeproj -scheme TidyWiseWidgetExtension -destination 'generic/platform=iOS' build 2>&1 | tail -5
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 6: Commit**

```bash
cd /Users/emmanuelforkuoh/jointidywise
git add ios/TidyWiseWidget/ ios/App/App.xcodeproj/
git commit -m "feat(ios): add TidyWiseWidget WidgetKit extension with booking view"
```

---

### Task 5: Add deep link handling for widget taps

**Files:**
- Modify: `src/lib/nativeOAuth.ts` (~line 52, expand `appUrlOpen` listener)
- Modify: `ios/App/App/Info.plist` (add `tidywise` URL scheme)

**Interfaces:**
- Consumes: Deep link URLs `tidywise://booking/{id}` and `tidywise://new-booking` (produced by widget views in Task 4)
- Produces: In-app navigation to booking detail or new booking screen when the widget is tapped

- [ ] **Step 1: Add the `tidywise` URL scheme to Info.plist**

In `ios/App/App/Info.plist`, inside the existing `CFBundleURLTypes` array (after the last `</dict>` of the OAuth callback entry, before the closing `</array>`), add:

```xml
<dict>
    <key>CFBundleURLName</key>
    <string>Widget Deep Link</string>
    <key>CFBundleURLSchemes</key>
    <array>
        <string>tidywise</string>
    </array>
</dict>
```

- [ ] **Step 2: Expand the `appUrlOpen` listener to handle widget deep links**

In `src/lib/nativeOAuth.ts`, modify the `appUrlOpen` callback (around line 52-53). Currently it returns early if the URL doesn't contain `auth/callback`. Change it to handle widget deep links first:

```typescript
return App.addListener('appUrlOpen', async ({ url }) => {
    // Handle widget deep links
    if (url.startsWith('tidywise://')) {
        const path = url.replace('tidywise://', '');

        if (path.startsWith('booking/')) {
            // Open the bookings page — no per-booking detail deep link exists yet
            window.location.href = '/dashboard/bookings';
        } else if (path === 'new-booking') {
            window.location.href = '/dashboard/bookings?newBooking=true';
        }
        return;
    }

    // Existing OAuth callback handling below...
    if (!url.includes('auth/callback')) {
        return;
    }
    // ... rest of existing code unchanged
```

Note: `BookingsPage.tsx:180` already handles `?newBooking=true`. There is no per-booking detail deep link yet — the booking tap opens the bookings list. A future enhancement could scroll to / highlight the specific booking.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/emmanuelforkuoh/jointidywise
npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add ios/App/App/Info.plist src/lib/nativeOAuth.ts
git commit -m "feat: add tidywise:// URL scheme and widget deep link routing"
```

---

### Task 6: Manual QA testing on device

**Files:** No code changes — this is verification only.

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Build and deploy to device**

```bash
cd /Users/emmanuelforkuoh/jointidywise
npm run build
npx cap sync ios
```

Then open in Xcode and run on a physical device (widgets don't work in all simulator configurations):

```bash
cd ios/App
open App.xcodeproj
```

Select a physical device and press Run (Cmd+R).

- [ ] **Step 2: Verify widget appears in widget gallery**

1. Long-press the home screen → tap `+` (top left)
2. Search for "TidyWise" in the widget gallery
3. Verify "Next Booking" widget appears with `.systemSmall` size
4. Add the widget to the home screen

- [ ] **Step 3: Verify booking data displays**

1. Open the TidyWise app and ensure you have at least one upcoming booking
2. Return to the home screen
3. Verify the widget shows: time, customer name, service type, address
4. Wait 15 minutes or background/foreground the app — verify the widget updates

- [ ] **Step 4: Verify empty state**

1. Cancel all upcoming bookings (or use a test account with none)
2. Open and close the TidyWise app to trigger sync
3. Verify the widget shows "Tap to schedule" with the calendar icon

- [ ] **Step 5: Verify deep links**

1. With a booking displayed, tap the widget → verify it opens the bookings page
2. With empty state, tap the widget → verify it opens the new booking form

- [ ] **Step 6: Test edge cases**

1. Long customer name (20+ chars) — verify it truncates with ellipsis
2. Long address — verify it truncates with ellipsis
3. Booking with no address — verify the address line is blank, not "null"
4. Booking with no service — verify it shows "Cleaning" as fallback
5. App not opened yet (fresh install) — verify widget shows empty state gracefully

- [ ] **Step 7: Commit any fixes from QA**

If any issues are found and fixed during QA:

```bash
git add -A
git commit -m "fix(ios): address QA findings from widget testing"
```
