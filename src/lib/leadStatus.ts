/**
 * Lead status and source: what they are, and what to call them.
 *
 * Third sibling of bookingStatus.ts and customerStatus.ts. Both columns hold
 * SLUGS, confirmed against the live table.
 */

type Tone = 'success' | 'info' | 'warn' | 'danger';

/** Mirrors STATUS_CONFIG in LeadsPage.tsx:91. */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'info' },
  follow_up: { label: 'Follow Up', tone: 'warn' },
  quoted: { label: 'Quoted', tone: 'info' },
  commercial: { label: 'Commercial', tone: 'warn' },
  converted: { label: 'Converted', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
};

export function leadStatusBadge(s: string | null | undefined): { label: string; tone: Tone } {
  if (!s) return { label: 'New', tone: 'info' };
  return STATUS[s] ?? { label: s, tone: 'info' };
}

/**
 * Source labels.
 *
 * LeadsPage has SOURCE_OPTIONS (:100) but uses it ONLY to populate the filter
 * dropdown (:666). The table cell renders `{lead.source}` raw under CSS
 * `capitalize` (:770), and since `customer_import` is a single word to CSS
 * that prints as "Customer_import" — underscore and all.
 *
 * Worse than cosmetic: `customer_import` is not in SOURCE_OPTIONS, so those
 * leads cannot be filtered for either. On the live org that is 5 of 6 leads —
 * 83% of them display wrong and are unreachable by every filter except "All
 * Sources".
 *
 * The map covers what the table actually contains, not just what the filter
 * offers, and anything unrecognised is de-slugged rather than printed raw.
 */
const SOURCE: Record<string, string> = {
  website: 'Website',
  referral: 'Referral',
  google: 'Google',
  facebook: 'Facebook',
  customer_import: 'Imported from customers',
  csv_import: 'CSV import',
  manual: 'Added by hand',
  other: 'Other',
};

export function leadSourceLabel(s: string | null | undefined): string {
  if (!s) return 'Unknown source';
  if (SOURCE[s]) return SOURCE[s];
  /* Unknown slug: turn separators into spaces and sentence-case it, so a new
     value added by a future integration reads as words rather than as a
     column name. */
  const words = s.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Lead display name.
 *
 * `leads.name` is one column, not first/last — but it still arrives with
 * doubled internal spaces ("Joe  anino", "apple  client"), because the import
 * that created these rows concatenated a first name carrying trailing
 * whitespace. Same root cause as customers, one table further downstream.
 */
export function leadDisplayName(name: string | null | undefined): string | null {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  return n || null;
}
