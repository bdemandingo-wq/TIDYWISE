# All 17 per-page CSV exports corrupt rows containing commas, quotes or newlines

**Found:** 2026-08-04, while building the full-org data export.
**Status:** open. Not fixed — the new export sidesteps it with its own serializer.
**Severity:** silent data corruption in files customers keep.

## What

Every per-page CSV export builds its file inline, with no escaping:

```ts
const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
```

There is no shared serializer. `src/lib/exportFile.ts` and
`src/lib/fileActions.ts` only handle *saving* a blob; the CSV text itself is
constructed independently in each page. `buildPlatformRevenueCsv`
(`src/lib/platformRevenueExport.ts`) is the sole correct implementation and is
platform-only.

## Why it breaks

A value containing `,` splits into extra columns. A value containing a newline
splits into an extra row. A value containing `"` is emitted unquoted. Objects
and arrays stringify to `[object Object]`.

Measured against three representative rows, the naive pattern emitted a
**4-column row where 6 were expected** — a customer named `Smith, John` plus a
jsonb `tags` column was enough. Every column after the first bad value is
shifted, so the damage is not localised: it silently reassigns data to the
wrong fields.

This is realistic input, not contrived. Cleaning businesses have customers with
comma-containing names and addresses, and free-text `notes` fields that
routinely contain line breaks.

## Affected

17 call sites across:

`BookingsPage`, `CustomersPage`, `FinancePage`, `SchedulerPage`,
`ClientFeedbackPage`, `LeadsPage` (Excel), `PayrollPage`, `InventoryPage` (×2),
`ExpensesPage`, `OperationsTrackerPage`, `ServicesPage`, `CleanerEarnings`
("Export for Taxes"), `CleanerPerformanceDashboard`, `ProfitMarginReport`,
`PortalProfileTab`, `PlatformRevenuePage`.

`CleanerEarnings`' "Export for Taxes" is worth calling out — a corrupted tax
export is the worst instance of this on the list.

## Fix

`rowsToCsv()` / `escapeCsvValue()` in `src/lib/orgDataExport.ts` already
implement RFC 4180 properly: quote on `,` `"` `\n` `\r` or surrounding
whitespace, double inner quotes, `null` → empty, objects → JSON, CRLF line
endings. Round-trip verified against a parser for all of those cases.

The fix is to export those two functions and replace each inline construction
with a call. Mechanical, but 17 sites each with their own header/row shape, so
worth doing as its own pass rather than folded into other work.
