/**
 * Frequency slugs → words.
 *
 * `bookings.frequency` and `recurring_bookings.frequency` hold slugs, and
 * nothing in src/lib mapped them to labels. The canonical set is documented in
 * recurringDiscount.ts: one_time, weekly, biweekly, triweekly, monthly, anyday
 * — plus the public booking form's variants (one-time, bi-weekly) and the
 * custom frequencies, which arrive as 'custom' or 'custom_<uuid>'.
 *
 * Live values seen on this org: 'weekly', 'biweekly', 'triweekly' in
 * recurring_bookings; 'one_time', 'weekly', 'biweekly', 'monthly', 'anyday' in
 * bookings. 'anyday' is the one that reads worst raw — it looks like a typo
 * rather than a setting.
 */

const LABELS: Record<string, string> = {
  onetime: 'One time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  triweekly: 'Every 3 weeks',
  monthly: 'Monthly',
  /* "Any day" is the org saying it will fit the customer in whenever suits —
     not a schedule. Worth spelling out rather than leaving as a word nobody
     recognises. */
  anyday: 'Any day that suits',
};

/**
 * @param customName the custom frequency's own name, when the caller has
 *   looked it up. A custom frequency's whole point is that the org named it,
 *   so printing "Custom" instead is losing the only useful part.
 */
export function frequencyLabel(
  frequency: string | null | undefined,
  customName?: string | null,
): string {
  if (!frequency) return 'No schedule set';

  /* Normalise the public form's hyphenated variants onto the canonical ids,
     the same way getFrequencyDiscountPct does. */
  const id = frequency.toLowerCase().replace(/[-_]/g, '');

  if (frequency === 'custom' || frequency.startsWith('custom_')) {
    return customName || 'Custom schedule';
  }
  if (LABELS[id]) return LABELS[id];

  /* Unknown slug: words rather than a column value, so a frequency added by a
     future migration reads as English. */
  const words = frequency.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Sunday-first, matching DAYS_OF_WEEK in RecurringBookingsPage. */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * `preferred_day` is an INTEGER day index (live values: 0, 3, 4), not a name.
 * Rendering the column directly prints "4".
 */
export function dayName(index: number | null | undefined): string | null {
  if (index === null || index === undefined) return null;
  return DAY_NAMES[index] ?? null;
}
