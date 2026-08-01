import {
  orgStartOfDay, orgAddDays, orgDayOfWeek, orgDaysBetween, orgDateKey, formatInOrgTz,
} from '@/lib/orgDateRange';

/**
 * Pay-period boundaries in the ORG's timezone.
 *
 * Every function here previously used date-fns startOfDay/getDay/addDays, all
 * of which run in BROWSER-LOCAL time. Two problems, and the second is sharper
 * than the timezone one:
 *
 *  1. Boundaries moved with the viewer. An admin abroad computed a different
 *     period than the office did for the same day.
 *
 *  2. The biweekly anchor divided a millisecond delta by 86400000. Across a DST
 *     change a local day is 23 or 25 hours, so that quotient could floor to one
 *     day short, flipping the odd/even week test and shifting the ENTIRE
 *     biweekly period by seven days. That was wrong for everyone, in one zone,
 *     twice a year.
 *
 * Both are gone: all arithmetic is now whole calendar days in org time.
 */

export interface PayrollPeriodConfig {
  payroll_frequency: 'weekly' | 'biweekly';
  payroll_start_day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  payroll_custom_days: number[] | null; // only for weekly custom
}

export const DEFAULT_PAYROLL_CONFIG: PayrollPeriodConfig = {
  payroll_frequency: 'weekly',
  payroll_start_day: 1,
  payroll_custom_days: null,
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getDayName(day: number, full = false): string {
  return full ? DAY_NAMES_FULL[day] : DAY_NAMES[day];
}

export function getEndDay(config: PayrollPeriodConfig): number {
  const span = config.payroll_frequency === 'biweekly' ? 13 : 6;
  return (config.payroll_start_day + span) % 7;
}

/**
 * Get the start date of the payroll period that contains `date`.
 */
export function getPeriodStart(date: Date, config: PayrollPeriodConfig, timeZone: string): Date {
  const d = orgStartOfDay(date, timeZone);
  const currentDay = orgDayOfWeek(d, timeZone);
  let diff = currentDay - config.payroll_start_day;
  if (diff < 0) diff += 7;

  const candidateStart = orgAddDays(d, -diff, timeZone);

  if (config.payroll_frequency === 'biweekly') {
    // Stable anchor: Monday 1 Jan 2024, as an org-local calendar date. Counting
    // in whole calendar days rather than milliseconds is what makes the parity
    // test survive DST — see the note at the top of this file.
    const anchor = orgStartOfDay(new Date(Date.UTC(2024, 0, 1, 12)), timeZone);
    const daysSinceAnchor = orgDaysBetween(anchor, candidateStart, timeZone);
    const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
    if (weeksSinceAnchor % 2 !== 0) {
      return orgAddDays(candidateStart, -7, timeZone);
    }
    return candidateStart;
  }

  return candidateStart;
}

export function getPeriodEnd(periodStart: Date, config: PayrollPeriodConfig, timeZone: string): Date {
  const span = config.payroll_frequency === 'biweekly' ? 13 : 6;
  return orgAddDays(periodStart, span, timeZone);
}

export function getCurrentPeriod(config: PayrollPeriodConfig, timeZone: string): { start: Date; end: Date } {
  const start = getPeriodStart(new Date(), config, timeZone);
  return { start, end: getPeriodEnd(start, config, timeZone) };
}

export function getNextPeriod(config: PayrollPeriodConfig, timeZone: string): { start: Date; end: Date } {
  const current = getCurrentPeriod(config, timeZone);
  const nextStart = orgAddDays(current.end, 1, timeZone);
  return { start: nextStart, end: getPeriodEnd(nextStart, config, timeZone) };
}

export function formatPeriodLabel(start: Date, end: Date, timeZone: string): string {
  // Rendered in org time too. A label formatted device-side could name a
  // different day than the boundary it describes.
  return `${formatInOrgTz(start, timeZone, { month: 'short', day: 'numeric' })} – ` +
         `${formatInOrgTz(end, timeZone, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** yyyy-MM-dd for a period boundary, for keys and query bounds. */
export function periodDateKey(d: Date, timeZone: string): string {
  return orgDateKey(d, timeZone);
}

export function getPeriodTitle(config: PayrollPeriodConfig, which: 'current' | 'next'): string {
  if (config.payroll_frequency === 'biweekly') {
    return which === 'current' ? 'Current Bi-Weekly Period' : 'Next Bi-Weekly Period';
  }
  return which === 'current' ? 'Current Pay Period' : 'Next Pay Period';
}
