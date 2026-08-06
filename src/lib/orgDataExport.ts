import { supabase } from '@/lib/supabase';

/**
 * Full-organisation data export — every business record an org owns, as one
 * zip of CSVs.
 *
 * Why this exists: the product had ~17 separate per-page CSV buttons and no way
 * to get everything at once, which made "can we get our data out?" a fair
 * question to answer badly. This is the answer to that question, so it has to
 * be complete and correct in ways a per-page export does not.
 *
 * Three things here are deliberate and easy to get wrong:
 *
 * 1. EXPLICIT ORG FILTER, NOT RLS. Every query filters organization_id itself.
 *    RLS is a backstop, not the scoping mechanism: policies are PERMISSIVE and
 *    therefore OR together, and ~33 org-scoped tables carry an extra
 *    own-record policy that is NOT org-scoped — `staff` allows
 *    `user_id = auth.uid()`, `customers` allows `user_id = auth.uid()`, and
 *    working_hours / leads / recurring_bookings / booking_checkins and others
 *    allow rows belonging to your own staff record. An owner who is also staff
 *    or a customer at a DIFFERENT business would otherwise pull that
 *    business's rows into their export.
 *
 * 2. PAGINATION, ALWAYS. PostgREST caps a response at 1000 rows and returns no
 *    error when it truncates. The biggest org has 10,724 sms_messages, so a
 *    bare select() would hand over 9% of one table and call it a success.
 *    useBookings.ts and useLeadSmartSync.ts already page at this size for the
 *    same reason.
 *
 * 3. ORDER BY id ON EVERY PAGE. `.range()` without `.order()` is undefined —
 *    rows shift between pages, so some are never returned and others come back
 *    twice (CLAUDE.md rule 3). id is unique, which a timestamp is not.
 */

const PAGE_SIZE = 1000;

export interface ExportTable {
  /** Postgres table name. */
  table: string;
  /** File name inside the zip, without extension. */
  file: string;
  /** Shown in the progress list. */
  label: string;
}

/**
 * The business records an organisation owns.
 *
 * Deliberately NOT every table with an organization_id column — there are 152
 * of those. Excluded on purpose:
 *
 *   - Operational noise nobody is owed on the way out: sms_send_log,
 *     email_send_failures, automation_fire_log, system_logs,
 *     product_tour_events, *_queue tables.
 *   - Config holding third-party secrets: org_stripe_settings,
 *     organization_sms_settings, org_gmail_connections. These carry API keys
 *     and access tokens, have column-level REVOKEs against `authenticated`,
 *     and would either error the request or export blank columns.
 *   - Tables with RLS enabled and NO select policy, which return empty rather
 *     than erroring and would ship a misleading empty file: ai_credit_ledger,
 *     ai_credit_ledger_entries, ai_credit_processed_sessions, ai_usage_daily,
 *     short_urls.
 */
export const EXPORT_TABLES: ExportTable[] = [
  { table: 'customers', file: 'customers', label: 'Customers' },
  { table: 'bookings', file: 'bookings', label: 'Bookings' },
  { table: 'recurring_bookings', file: 'recurring-bookings', label: 'Recurring bookings' },
  { table: 'invoices', file: 'invoices', label: 'Invoices' },
  { table: 'invoice_items', file: 'invoice-items', label: 'Invoice line items' },
  { table: 'quotes', file: 'quotes', label: 'Quotes' },
  { table: 'estimates', file: 'estimates', label: 'Estimates' },
  { table: 'staff', file: 'staff', label: 'Staff' },
  { table: 'working_hours', file: 'working-hours', label: 'Working hours' },
  { table: 'time_off_requests', file: 'time-off-requests', label: 'Time off requests' },
  { table: 'payroll_payments', file: 'payroll-payments', label: 'Payroll payments' },
  { table: 'expenses', file: 'expenses', label: 'Expenses' },
  { table: 'tips', file: 'tips', label: 'Tips' },
  { table: 'services', file: 'services', label: 'Services' },
  { table: 'service_pricing', file: 'service-pricing', label: 'Service pricing' },
  { table: 'discounts', file: 'discounts', label: 'Discounts' },
  { table: 'inventory_items', file: 'inventory-items', label: 'Inventory' },
  { table: 'leads', file: 'leads', label: 'Leads' },
  { table: 'client_feedback', file: 'client-feedback', label: 'Client feedback' },
  { table: 'loyalty_transactions', file: 'loyalty-transactions', label: 'Loyalty transactions' },
  { table: 'property_notes', file: 'property-notes', label: 'Property notes' },
  { table: 'tasks_and_notes', file: 'tasks-and-notes', label: 'Tasks and notes' },
  { table: 'operations_tracker', file: 'operations-tracker', label: 'Operations tracker' },
  { table: 'booking_photos', file: 'booking-photos', label: 'Booking photos (metadata)' },
  { table: 'booking_checkins', file: 'booking-checkins', label: 'Booking check-ins' },
  { table: 'sms_conversations', file: 'sms-conversations', label: 'SMS conversations' },
  { table: 'sms_messages', file: 'sms-messages', label: 'SMS messages' },
];

/**
 * Escape one value for RFC 4180 CSV.
 *
 * Exported because the per-page exports inline their own serialisation, and the
 * ones that attempt escaping mostly get it wrong in the same way: they wrap
 * every cell in quotes but never double the inner ones, so a value containing
 * `"` terminates its own field early and shifts every column after it. That is
 * worse than no escaping at all, because the output looks handled.
 *
 * Use {@link matrixToCsv} rather than calling this per cell — the separator and
 * line ending are part of the format, and hand-rolling those is how the current
 * mess arose.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === 'object') {
    // jsonb columns and arrays. JSON keeps them re-readable instead of
    // rendering "[object Object]".
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }

  // Quote when the value could otherwise break the row or the column layout.
  // A leading/trailing space is quoted too so it survives a round trip.
  if (/[",\n\r]/.test(str) || str !== str.trim()) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialise rows to CSV. Column order comes from the union of every row's keys,
 * not just the first row's — Postgres omits nothing, but a jsonb-shaped row or
 * a future partial select could, and a missing column would silently drop data.
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [columns.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvValue(row[c])).join(','));
  }
  // CRLF is what RFC 4180 specifies and what Excel is happiest with.
  return lines.join('\r\n');
}

/**
 * Serialise a matrix of rows — header row included — to RFC 4180 CSV.
 *
 * {@link rowsToCsv} takes objects and derives columns from their keys, which is
 * right for a table dump but wrong for the per-page exports: those build arrays
 * of arrays with hand-written headers. Callers pass `[headers, ...rows]`,
 * exactly the shape they already had before `.join(',')`, and get correct
 * quoting and CRLF endings instead.
 *
 * No BOM. Callers that need Excel to auto-detect UTF-8 prepend U+FEFF
 * themselves — baking it in would corrupt the output for anything that feeds
 * these files to a parser rather than to Excel.
 */
export function matrixToCsv(rows: readonly unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}

export interface TableExportResult {
  table: string;
  file: string;
  label: string;
  /** Rows actually written. */
  rowCount: number;
  /** What the server said the count was, for the completeness check. */
  expectedCount: number;
  csv: string;
  /** Set when the table could not be exported, or came back short. */
  error?: string;
}

/**
 * Fetch every row of one table for one org, a page at a time.
 *
 * Returns the expected count alongside the rows so the caller can prove the
 * export is complete rather than assume it. A short file that reports success
 * is worse than a loud failure — it is discovered months later, by someone who
 * needed the missing rows.
 */
async function fetchTable(
  table: string,
  organizationId: string,
  signal?: AbortSignal,
): Promise<{ rows: Record<string, unknown>[]; expectedCount: number }> {
  // The table name is chosen at runtime from EXPORT_TABLES, so the generated
  // per-table types cannot apply. Narrowed to just the builder methods used
  // here rather than casting to `any`.
  interface Filterable {
    select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => Filterable;
    eq: (col: string, val: string) => Filterable;
    order: (col: string, opts: { ascending: boolean }) => Filterable;
    range: (from: number, to: number) => Filterable;
    then: Promise<{
      data: Record<string, unknown>[] | null;
      count: number | null;
      error: { message: string } | null;
    }>['then'];
  }
  const client = supabase as unknown as { from: (t: string) => Filterable };

  const { count, error: countError } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  // No catch-to-empty: a failed count must not read as "this table is empty"
  // (CLAUDE.md rule 5).
  if (countError) throw countError;

  const expectedCount = count ?? 0;
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; from < expectedCount; from += PAGE_SIZE) {
    if (signal?.aborted) throw new Error('Export cancelled');

    const { data, error } = await client
      .from(table)
      .select('*')
      // Explicit, not left to RLS — see the note at the top of this file.
      .eq('organization_id', organizationId)
      // Unique tiebreaker so pages cannot overlap or skip.
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as Record<string, unknown>[]));
  }

  return { rows, expectedCount };
}

export interface ExportProgress {
  completed: number;
  total: number;
  currentLabel: string;
}

/**
 * Build the whole export. Tables run sequentially on purpose: parallel requests
 * would be faster but would also hammer the API from a browser tab and make the
 * progress display meaningless. The largest org totals ~13,000 rows, so this is
 * seconds, not minutes.
 *
 * One table failing does not abandon the rest — it is recorded against that
 * table and reported, so the operator gets 26 good files plus a named problem
 * rather than nothing at all.
 */
export async function buildOrgExport(
  organizationId: string,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<TableExportResult[]> {
  const results: TableExportResult[] = [];

  for (let i = 0; i < EXPORT_TABLES.length; i++) {
    const t = EXPORT_TABLES[i];
    onProgress?.({ completed: i, total: EXPORT_TABLES.length, currentLabel: t.label });

    try {
      const { rows, expectedCount } = await fetchTable(t.table, organizationId, signal);
      results.push({
        table: t.table,
        file: t.file,
        label: t.label,
        rowCount: rows.length,
        expectedCount,
        csv: rowsToCsv(rows),
        // Proves completeness instead of assuming it. PostgREST truncating at
        // 1000 rows is silent, so this is the only thing standing between a
        // partial export and a customer who thinks they have everything.
        error:
          rows.length === expectedCount
            ? undefined
            : `Expected ${expectedCount} rows, got ${rows.length}`,
      });
    } catch (err) {
      results.push({
        table: t.table,
        file: t.file,
        label: t.label,
        rowCount: 0,
        expectedCount: 0,
        csv: '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.({
    completed: EXPORT_TABLES.length,
    total: EXPORT_TABLES.length,
    currentLabel: 'Done',
  });
  return results;
}

/**
 * A short manifest describing what is in the zip and whether it is complete.
 * Included as a file so the recipient can tell a genuinely empty table from one
 * that failed — the difference matters and is invisible from an empty CSV.
 */
export function buildManifest(
  orgName: string,
  results: TableExportResult[],
  generatedAtIso: string,
): string {
  const lines = [
    `TidyWise data export`,
    `Organisation: ${orgName}`,
    `Generated: ${generatedAtIso}`,
    ``,
    `One CSV per table. Empty tables are included as empty files so the set is`,
    `complete and predictable.`,
    ``,
    `file,table,rows,expected,status`,
  ];
  for (const r of results) {
    lines.push(
      [
        `${r.file}.csv`,
        r.table,
        String(r.rowCount),
        String(r.expectedCount),
        r.error ? `INCOMPLETE: ${r.error}` : 'ok',
      ]
        .map(escapeCsvValue)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
