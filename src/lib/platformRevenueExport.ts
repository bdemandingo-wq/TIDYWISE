/**
 * Platform revenue, as one CSV a stranger can read.
 *
 * WHAT THIS IS FOR
 * Handing to an accountant, a buyer, or a diligence process — by someone who
 * has no access to Lovable, Supabase, or this repo. That constraint decides
 * every formatting choice below: nothing here may require the reader to know
 * what a column name means, what a cent is, or what "probable" refers to.
 *
 * SO:
 *   - business NAMES, not organisation UUIDs
 *   - DATES, not ISO timestamps
 *   - DOLLARS, not cents
 *   - the confidence tier spelled out on EVERY row, with a legend, rather than
 *     inferred from which section a row is in
 *
 * Stripe identifiers are kept, deliberately. They are not internal ids — they
 * are the reconciliation key against a Stripe export, which is the first thing
 * anyone receiving this will want to check it against.
 *
 * ON INCLUDING RAW EVENTS
 * billing_revenue_by_confidence carries a COMMENT that reads as a specification:
 * "THE reporting surface for platform revenue. Do not report off billing_events
 * directly." That rule exists because filtering events by event_type once
 * reported one tier gross of a $49 dispute while the others were net.
 *
 * This file honours it. Section 1 is the authoritative total and comes from the
 * view. Section 3 carries the raw events so the file stands on its own, and is
 * labelled as SOURCE RECORDS — nothing in this exporter sums them, and the
 * section header says not to. Shipping the evidence is not the same as
 * reporting off it.
 */

export interface RevenueByConfidenceRow {
  month: string;
  stream: string;
  confidence: string;
  events: number;
  payment_events: number;
  reversal_events: number;
  gross_cents: number;
  reversal_cents: number;
  net_cash_cents: number;
}

export interface PlanPayerRow {
  organization_name: string | null;
  customer_email: string | null;
  confidence_worst: string | null;
  payment_events: number;
  reversal_events: number;
  gross_cents: number;
  reversal_cents: number;
  net_cash_cents: number;
  first_payment_at: string | null;
  last_payment_at: string | null;
}

export interface BillingEventRow {
  occurred_at: string | null;
  organization_name: string | null;
  customer_email: string | null;
  event_type: string | null;
  revenue_stream: string | null;
  revenue_stream_corrected: string | null;
  correction_confidence: string | null;
  correction_basis: string | null;
  counts_as_cash: boolean | null;
  is_proration: boolean | null;
  currency: string | null;
  amount_cents: number | null;
  fee_cents: number | null;
  net_cents: number | null;
  description: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

/** Cents to a plain dollar figure. Empty string for a missing value, never 0. */
function dollars(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/**
 * An ISO timestamp to a calendar date, in UTC and labelled as such.
 *
 * UTC rather than any organisation's zone: this file spans every org on the
 * platform, so there is no single business calendar to use, and a reader
 * reconciling against Stripe is reading Stripe's UTC too. The column heading
 * says "(UTC)" so it cannot be mistaken for a local date.
 */
function utcDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** "2026-08" to "August 2026". The reader should not have to parse a key. */
function monthName(month: string | null | undefined): string {
  if (!month) return '';
  const d = new Date(`${month.length === 7 ? `${month}-01` : month}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(month);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** snake_case to Title Case, so "merchant_cleaning" reads as "Merchant Cleaning". */
function label(v: string | null | undefined): string {
  if (!v) return '';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function yesNo(v: boolean | null | undefined): string {
  if (v == null) return '';
  return v ? 'Yes' : 'No';
}

/** Excel-safe CSV cell. Quotes everything, so a comma in a business name is fine. */
function cell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function row(values: unknown[]): string {
  return values.map(cell).join(',');
}

export interface PlatformRevenueExportInput {
  revenue: RevenueByConfidenceRow[];
  payers: PlanPayerRow[];
  events: BillingEventRow[];
  /** Stamped into the header so the file says when it was produced. */
  generatedAt: Date;
}

export function buildPlatformRevenueCsv(input: PlatformRevenueExportInput): string {
  const { revenue, payers, events, generatedAt } = input;
  const out: string[] = [];

  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(generatedAt);

  out.push(row(['TidyWise platform revenue']));
  out.push(row([`Generated ${stamp} UTC. All amounts in US dollars.`]));
  out.push('');
  out.push(row(['CONFIDENCE MEANS HOW CERTAIN WE ARE THAT A PAYMENT BELONGS TO THE STREAM SHOWN']));
  out.push(row(['Certain', 'Attributed directly from Stripe metadata. No inference.']));
  out.push(row(['Probable', 'Attributed from strong secondary evidence, e.g. the subscription it sits under.']));
  out.push(row(['Inferred', 'Attributed by best guess. EXCLUDED from headline figures.']));
  out.push('');

  // ── 1. The authoritative totals ────────────────────────────────────────────
  out.push(row(['SECTION 1 OF 3 — REVENUE BY MONTH, STREAM AND CONFIDENCE']));
  out.push(row(['This is the reporting surface. Section 3 is evidence, not a second total.']));
  out.push(row([
    'Month', 'Revenue stream', 'Confidence',
    'Payments', 'Refunds and disputes', 'Total events',
    'Gross ($)', 'Refunded ($)', 'Net cash ($)',
  ]));
  for (const r of revenue) {
    out.push(row([
      monthName(r.month), label(r.stream), label(r.confidence),
      r.payment_events, r.reversal_events, r.events,
      dollars(r.gross_cents), dollars(r.reversal_cents), dollars(r.net_cash_cents),
    ]));
  }
  out.push('');

  // ── 2. Who is paying ───────────────────────────────────────────────────────
  out.push(row(['SECTION 2 OF 3 — SUBSCRIPTION PAYERS']));
  out.push(row(['One row per paying business. Confidence is the WORST tier among that business’s payments.']));
  out.push(row([
    'Business', 'Billing email', 'Confidence (worst)',
    'Payments', 'Refunds and disputes',
    'Gross ($)', 'Refunded ($)', 'Net cash ($)',
    'First payment (UTC)', 'Last payment (UTC)',
  ]));
  for (const p of payers) {
    out.push(row([
      p.organization_name ?? 'Unknown business',
      p.customer_email ?? '',
      label(p.confidence_worst),
      p.payment_events, p.reversal_events,
      dollars(p.gross_cents), dollars(p.reversal_cents), dollars(p.net_cash_cents),
      utcDate(p.first_payment_at), utcDate(p.last_payment_at),
    ]));
  }
  out.push('');

  // ── 3. The evidence ────────────────────────────────────────────────────────
  out.push(row(['SECTION 3 OF 3 — SOURCE RECORDS (one row per Stripe event)']));
  out.push(row([
    'Included so this file stands alone. Do NOT total this section to check Section 1 — ' +
    'it contains events that do not count as cash, and the two are not the same population. ' +
    'Section 1 is the figure.',
  ]));
  out.push(row([
    'Date (UTC)', 'Business', 'Billing email',
    'Event', 'Revenue stream', 'Stream after correction', 'Confidence', 'Why corrected',
    'Counts as cash', 'Is proration', 'Currency',
    'Amount ($)', 'Stripe fee ($)', 'Net ($)', 'Description',
    'Stripe charge', 'Stripe invoice', 'Stripe subscription', 'Stripe customer',
  ]));
  for (const e of events) {
    out.push(row([
      utcDate(e.occurred_at),
      e.organization_name ?? 'Unknown business',
      e.customer_email ?? '',
      label(e.event_type),
      label(e.revenue_stream),
      label(e.revenue_stream_corrected),
      label(e.correction_confidence),
      e.correction_basis ?? '',
      yesNo(e.counts_as_cash),
      yesNo(e.is_proration),
      (e.currency ?? 'usd').toUpperCase(),
      dollars(e.amount_cents), dollars(e.fee_cents), dollars(e.net_cents),
      e.description ?? '',
      e.stripe_charge_id ?? '', e.stripe_invoice_id ?? '',
      e.stripe_subscription_id ?? '', e.stripe_customer_id ?? '',
    ]));
  }

  return out.join('\n');
}
