/**
 * US federal holidays, computed rather than listed.
 *
 * This replaces a hardcoded `['1/1','7/4',…,'11/28','1/15','2/19','5/27','9/2','10/14']`
 * array in PublicBookingPage's surge logic. Six of those entries are
 * OBSERVED-DATE holidays that fall on a different calendar date every year —
 * Thanksgiving, MLK, Presidents', Memorial, Labor and Columbus — so a frozen
 * month/day list is wrong from the year after it was written.
 *
 * The old list appears to have been written against one specific year and was
 * already a day or two off for 2026. Left alone it would have surcharged
 * customers on ordinary days (28 November 2027 is a Sunday) while missing the
 * real holiday, and nothing logs either case — it surfaces as a pricing
 * complaint, not a monitoring alert.
 *
 * Dates are computed in LOCAL time to match the caller, which reads
 * `selectedDate.getMonth()` / `.getDate()`.
 */

/** Weekday numbers as returned by Date.prototype.getDay(). */
const SUN = 0, MON = 1, THU = 4;

/** The date of the nth given weekday in a month. n is 1-based. */
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): number {
  const firstDow = new Date(year, month0, 1).getDay();
  // Days until the first occurrence of `weekday`, then n-1 whole weeks on top.
  const offset = (weekday - firstDow + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

/** The date of the last given weekday in a month. */
function lastWeekdayOfMonth(year: number, month0: number, weekday: number): number {
  const lastDay = new Date(year, month0 + 1, 0).getDate();
  const lastDow = new Date(year, month0, lastDay).getDay();
  return lastDay - ((lastDow - weekday + 7) % 7);
}

export interface UsHoliday {
  name: string;
  month0: number;
  day: number;
}

/**
 * Every holiday this app treats as surge-eligible, for a given year.
 *
 * Includes Christmas Eve and New Year's Eve, which are not federal holidays but
 * were in the original list and are legitimately high-demand for cleaning.
 */
export function usHolidaysForYear(year: number): UsHoliday[] {
  return [
    // Fixed-date — these were correct in the original list and stay as they are.
    { name: "New Year's Day", month0: 0, day: 1 },
    { name: 'Independence Day', month0: 6, day: 4 },
    { name: 'Veterans Day', month0: 10, day: 11 },
    { name: 'Christmas Eve', month0: 11, day: 24 },
    { name: 'Christmas Day', month0: 11, day: 25 },
    { name: "New Year's Eve", month0: 11, day: 31 },

    // Observed-date — computed, because these move every year.
    { name: 'Martin Luther King Jr. Day', month0: 0, day: nthWeekdayOfMonth(year, 0, MON, 3) },
    { name: "Presidents' Day", month0: 1, day: nthWeekdayOfMonth(year, 1, MON, 3) },
    { name: 'Memorial Day', month0: 4, day: lastWeekdayOfMonth(year, 4, MON) },
    { name: 'Labor Day', month0: 8, day: nthWeekdayOfMonth(year, 8, MON, 1) },
    { name: 'Columbus Day', month0: 9, day: nthWeekdayOfMonth(year, 9, MON, 2) },
    { name: 'Thanksgiving', month0: 10, day: nthWeekdayOfMonth(year, 10, THU, 4) },
  ];
}

/**
 * Is this date a surge-eligible US holiday?
 *
 * Uses the date's own year, so it stays correct indefinitely rather than needing
 * an annual edit.
 */
export function isUsHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return usHolidaysForYear(y).some((h) => h.month0 === m && h.day === d);
}

/** The holiday's name, or null. Useful for explaining a surcharge to a customer. */
export function usHolidayName(date: Date): string | null {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return usHolidaysForYear(y).find((h) => h.month0 === m && h.day === d)?.name ?? null;
}

// SUN is exported-adjacent only to document the getDay() convention above; it is
// intentionally unused so the constant block reads completely.
void SUN;
