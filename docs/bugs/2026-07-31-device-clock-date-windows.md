# Date windows computed from the device clock, not the org's timezone

**Reported:** 2026-07-31. Dashboard gross volume read **$888** on a Miami
computer and **$616** on a phone in Manila, where it was already 1 August.
**Status:** traced, nothing changed. Full surface below.

---

## 1. The reported bug, exactly

`src/pages/admin/AdminDashboard.tsx:90`

```ts
const todayBookings = bookings.filter(
  b => isToday(new Date(b.scheduled_at)) && b.status !== 'cancelled',
);
```

`isToday` is date-fns, comparing against `new Date()` in **browser-local time**.
So "today" is the *device's* calendar day, not the business's.

Manila is UTC+8, Miami on EDT is UTC−4 — twelve hours apart. So the phone's
"today" is:

```
Aug 1 00:00 PHT  =  Jul 31 12:00 EDT
Aug 1 23:59 PHT  =  Aug  1 11:59 EDT
```

### What $616 is

**Not a business day.** It is a 24-hour window starting at Miami noon on 31
July: the afternoon and evening of 31 July, plus anything *scheduled* for the
morning of 1 August. The filter is on `scheduled_at`, so future bookings inside
that band count.

That is why it reconciles against nothing — it is a slice of two days. The
$272 difference is the 31 July morning the phone's window starts after, minus
whatever 1 August morning work it wrongly picked up.

**The device is authoritative today.** Two people in different timezones will
never agree, and neither number is the business's.

---

## 2. The full surface — 30 files

Every file using `isToday`, `isSameDay`, `startOfDay/endOfDay`,
`startOfWeek/endOfWeek`, `startOfMonth/endOfMonth`, `isTomorrow`, `isYesterday`
against the device clock.

### Tier 1 — writes or decides money (fix first)

| File | Primitive | What breaks |
|---|---|---|
| `pages/admin/PayrollPage.tsx` | `startOfWeek` | **Worst in the list — see §3.** `weekStart` is the KEY written to `payroll_payments`. |
| `lib/payrollPeriod.ts` | `startOfDay` | Pay-period boundaries. |
| `pages/admin/AdminDashboard.tsx` | `isToday` | The reported bug. Gross volume, payments, new customers. |
| `pages/admin/FinancePage.tsx` | `startOfMonth`, `endOfMonth` | Total Sales, fees, refunds, net profit. |
| `pages/admin/ReportsPage.tsx` | `endOfMonth` | The monthly revenue chart. |
| `components/admin/PnLCalendar.tsx` | `startOfMonth`, `endOfMonth`, `isToday` | Already known to disagree **with itself** — buckets days in org tz, computes edges in device tz. |
| `components/admin/PnLOverview.tsx` | `startOfMonth`, `endOfMonth` | P&L totals. |
| `components/admin/ProfitMarginReport.tsx` | `startOfMonth`, `endOfMonth` | Margin by period. |
| `components/admin/RevenueForecasting.tsx` | `startOfMonth`, `endOfMonth` | Forecast base. |
| `components/staff/CleanerEarnings.tsx` | `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth` | **A cleaner's own earnings.** A cleaner and their admin can see different totals for the same week. |
| `components/admin/ReportsOverview.tsx` | `startOfDay`, `endOfDay`, `isSameDay`, `startOfMonth` | Summary figures. |

### Tier 2 — operational; wrong day, real consequences

| File | Primitive | What breaks |
|---|---|---|
| `hooks/useCleanerConflicts.ts` | `startOfDay`, `endOfDay`, `isSameDay` | **Double-booking detection.** A device in another zone can miss a same-day clash. |
| `components/admin/SchedulerCalendar.tsx` | week/month/day + `isToday` | Which jobs appear on which day. |
| `components/staff/CleanerCalendar.tsx` | week/month + `isToday` | Same, cleaner side. |
| `pages/admin/OperationsTrackerPage.tsx` | week/month, `isSameDay` | Ops view. |
| `pages/admin/BookingsPage.tsx` | `startOfDay`, `endOfDay` | The date filter. |
| `pages/admin/RecurringBookingsPage.tsx` | `startOfDay` | Series boundaries. |
| `components/admin/CleanerAvailabilityDashboard.tsx` | `startOfWeek`, `isSameDay` | Who is free when. |
| `components/admin/DemoCalendarTab.tsx` | full set | Demo scheduling. |
| `components/landing/DemoBookingForm.tsx` | full set | **Public form** — currently the visitor's timezone, not the business's. |

### Tier 3 — analytics and counts; wrong but not acted on directly

`components/admin/AIAnalysisCenter.tsx`, `AIDiscountSuggestions.tsx`,
`PerformanceAnalytics.tsx`, `CleanerPerformanceDashboard.tsx`,
`StaffProductivityMetrics.tsx`, `pages/admin/LeadsPage.tsx`,
`components/admin/DemoRequestsTab.tsx`

### Tier 4 — display only

`components/admin/CallsTab.tsx` (`isToday` badge),
`pages/admin/MessagesPage.tsx` (`isToday` message grouping)

### Probably already correct

`components/admin/campaigns/scheduleTime.ts` — uses `startOfDay`/`endOfDay` but
its header says it exists precisely because date-fns can't do timezones without
`date-fns-tz`. Verify before touching.

---

## 3. The one to fix first, and it isn't the dashboard

`pages/admin/PayrollPage.tsx:203`

```ts
const weekStart = format(startOfWeek(dateRange.from, { weekStartsOn: 1 }), 'yyyy-MM-dd');
```

That string is not a display value. It is the key used to **read and write**
`payroll_payments` — `:246`, `:304`, `:337`. So two admins in different
timezones can derive different `week_start` values for the same payroll period,
and payments get recorded under whichever the writer's device produced.

Every other entry in Tier 1 shows a wrong number. **This one stores one.** It is
also the one that gets silently worse over time, because the rows persist.

`PayrollPage` imports `useOrgTimezone` at `:36` and uses it at `:201` — so it
already knows the org's zone and computes the week boundary without it.

---

## 4. The dangerous subset: eight files that are half-converted

These already import org-timezone tooling **and** still compute window edges
from the device clock:

`CallsTab`, `PnLCalendar`, `SchedulerCalendar`, `CleanerCalendar`,
`BookingsPage`, `FinancePage`, `PayrollPage`, `ReportsPage`

They are the most dangerous group, because they look converted. `PnLCalendar` is
the proven case — it buckets days in org time while computing month edges in
device time, so a single screen disagrees with itself at the month boundary. The
other seven have the same shape and have not been checked individually.

`FinancePage` confirmed: `orgTz` fetched at `:62`, then
`from: startOfMonth(new Date())` at `:65`.

---

## 5. What the fix needs that does not exist yet

The tooling is most of the way there:

- `hooks/useOrgTimezone.ts` — reads `business_settings.timezone`, defaults
  `America/New_York`, cached 10 minutes.
- `lib/timezoneUtils.ts` — `getDateInTimezone`, `formatInTimezone`,
  `getLocalDateInTimezone`, `orgTimeToUTCISO`, `selectedDateTimeToUTCISO`.

**Missing: range helpers in org time.** There is no `orgStartOfDay`,
`orgEndOfDay`, `orgStartOfWeek/Month`, or `isOrgToday`. Every one of the 30 files
would otherwise hand-roll the conversion, which is how the half-converted eight
happened.

So step one is one new module — `lib/orgDateRange.ts` — with those helpers and
unit tests covering a westward device (Manila vs New York), an eastward one, and
a DST boundary. Everything else becomes a mechanical substitution against a
tested primitive.

**Note on `weekStartsOn`.** `PayrollPage` hardcodes Monday. `payroll_settings`
carries `payroll_week_start_day`, which is **read by nothing** — confirmed
earlier today. If the week start is ever meant to be configurable, the org-time
week helper is where it belongs, and that column stops being dead.

---

## 6. Suggested order

1. `lib/orgDateRange.ts` + tests. Nothing else can be done safely first.
2. **PayrollPage** — it writes a device-derived key to a money table.
3. AdminDashboard — the reported bug, and the one being looked at right now.
4. The rest of Tier 1, then the half-converted eight, then Tier 2.
5. Tiers 3 and 4 last, or never — a badge saying "Today" on the wrong side of
   midnight is not worth a regression risk in a file nobody has opened in months.

**Not piecemeal.** Converting one file inside a screen that shares state with
another converted file is how `PnLCalendar` ended up disagreeing with itself.
Each screen should move whole.
