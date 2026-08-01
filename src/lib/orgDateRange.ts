/**
 * Business-day boundaries in the ORGANISATION's timezone, never the device's.
 *
 * WHY THIS EXISTS
 * On 2026-07-31 the dashboard's gross volume read $888 on a Miami computer and
 * $616 on a phone in Manila. `AdminDashboard` filtered with date-fns `isToday`,
 * which compares against the BROWSER's calendar day. Manila is twelve hours
 * ahead of EDT, so the phone's "today" ran from noon on 31 July to noon on
 * 1 August in Miami terms — a band spanning two business days and matching
 * neither. Thirty files across the app compute windows that way.
 *
 * The rule this module exists to hold: **a business day starts and ends in the
 * business's timezone.** Where the person looking happens to be standing is
 * never part of the answer.
 *
 * WHY NOT date-fns-tz
 * It isn't installed, and this network has been unable to add packages all
 * session. `Intl.DateTimeFormat` with a timeZone is in every browser this app
 * supports and handles DST correctly, because the IANA database is what it
 * reads. The offset maths below is the standard trick for inverting it.
 */

/** 0 = Sunday … 6 = Saturday, matching Date.getDay() and Postgres `dow`. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * payroll_settings.payroll_week_start_day is stored as a lowercase day name and
 * is, as of 2026-07-31, read by nothing at all. This is the one place it has a
 * home: the week helper below is the only code that needs to know when a
 * business's week begins.
 */
const DAY_NAME_TO_INDEX: Record<string, WeekStartDay> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/** Monday, matching the value PayrollPage hardcoded before this existed. */
export const DEFAULT_WEEK_START: WeekStartDay = 1;

export function parseWeekStartDay(value: unknown): WeekStartDay {
  if (typeof value === 'number' && value >= 0 && value <= 6) return value as WeekStartDay;
  if (typeof value === 'string') {
    const idx = DAY_NAME_TO_INDEX[value.trim().toLowerCase()];
    if (idx !== undefined) return idx;
  }
  return DEFAULT_WEEK_START;
}

/**
 * What UTC offset does `timeZone` have at `instant`, in minutes?
 *
 * Formats the instant in that zone, reads the numbers back as if they were UTC,
 * and takes the difference. Correct across DST because Intl applies whichever
 * rule was in force at that instant, rather than today's.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  // Intl renders midnight as hour 24 in some engines.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(hour), Number(parts.minute), Number(parts.second),
  );
  // ROUND, don't divide raw. formatToParts has second precision, so `asUTC`
  // carries no milliseconds while `instant` may. Without rounding, asking for
  // 23:59:59.999 produced an offset 999ms off true, which pushed every
  // end-of-day/week/month one millisecond PAST local midnight and reported the
  // next day. Real UTC offsets are always whole minutes.
  return Math.round((asUTC - instant.getTime()) / 60000);
}

/** The wall-clock Y/M/D in `timeZone` at this instant. */
export function orgYMD(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = dtf.format(instant).split('-').map(Number);
  return { y, m, d };
}

/**
 * The instant at which a given wall-clock time occurs in `timeZone`.
 *
 * Two passes: guess using the offset at the naive timestamp, then re-measure at
 * the guess and correct. One correction is enough for every real zone — the
 * only case needing more would be an offset change of more than a day.
 */
function zonedTimeToInstant(
  y: number, m: number, d: number, hh: number, mm: number, ss: number, ms: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
  let instant = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60000);
  instant = new Date(naive - offsetMinutes(instant, timeZone) * 60000);
  return instant;
}

/** First instant of the org-local day containing `instant`. */
export function orgStartOfDay(instant: Date, timeZone: string): Date {
  const { y, m, d } = orgYMD(instant, timeZone);
  return zonedTimeToInstant(y, m, d, 0, 0, 0, 0, timeZone);
}

/** Last instant of the org-local day containing `instant` (23:59:59.999). */
export function orgEndOfDay(instant: Date, timeZone: string): Date {
  const { y, m, d } = orgYMD(instant, timeZone);
  return zonedTimeToInstant(y, m, d, 23, 59, 59, 999, timeZone);
}

/** Is `instant` on the same org-local calendar day as `other`? */
export function isSameOrgDay(instant: Date, other: Date, timeZone: string): boolean {
  const a = orgYMD(instant, timeZone);
  const b = orgYMD(other, timeZone);
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

/** Is `instant` on the org's current calendar day? Replaces date-fns isToday. */
export function isOrgToday(instant: Date, timeZone: string, now: Date = new Date()): boolean {
  return isSameOrgDay(instant, now, timeZone);
}

/** Day of week (0=Sun) of the org-local day containing `instant`. */
export function orgDayOfWeek(instant: Date, timeZone: string): number {
  const { y, m, d } = orgYMD(instant, timeZone);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * First instant of the org-local week containing `instant`.
 *
 * `weekStartsOn` comes from payroll_settings.payroll_week_start_day via
 * parseWeekStartDay, defaulting to Monday.
 */
export function orgStartOfWeek(
  instant: Date, timeZone: string, weekStartsOn: WeekStartDay = DEFAULT_WEEK_START,
): Date {
  const dow = orgDayOfWeek(instant, timeZone);
  const back = (dow - weekStartsOn + 7) % 7;
  const { y, m, d } = orgYMD(instant, timeZone);
  // Step in whole days on the UTC calendar, then resolve — so a DST shift
  // inside the week cannot drag the boundary off midnight.
  const stepped = new Date(Date.UTC(y, m - 1, d - back));
  return zonedTimeToInstant(
    stepped.getUTCFullYear(), stepped.getUTCMonth() + 1, stepped.getUTCDate(),
    0, 0, 0, 0, timeZone,
  );
}

export function orgEndOfWeek(
  instant: Date, timeZone: string, weekStartsOn: WeekStartDay = DEFAULT_WEEK_START,
): Date {
  const start = orgStartOfWeek(instant, timeZone, weekStartsOn);
  const { y, m, d } = orgYMD(start, timeZone);
  const stepped = new Date(Date.UTC(y, m - 1, d + 6));
  return zonedTimeToInstant(
    stepped.getUTCFullYear(), stepped.getUTCMonth() + 1, stepped.getUTCDate(),
    23, 59, 59, 999, timeZone,
  );
}

export function orgStartOfYear(instant: Date, timeZone: string): Date {
  const { y } = orgYMD(instant, timeZone);
  return zonedTimeToInstant(y, 1, 1, 0, 0, 0, 0, timeZone);
}

export function orgStartOfMonth(instant: Date, timeZone: string): Date {
  const { y, m } = orgYMD(instant, timeZone);
  return zonedTimeToInstant(y, m, 1, 0, 0, 0, 0, timeZone);
}

export function orgEndOfMonth(instant: Date, timeZone: string): Date {
  const { y, m } = orgYMD(instant, timeZone);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return zonedTimeToInstant(y, m, lastDay, 23, 59, 59, 999, timeZone);
}

/**
 * `yyyy-MM-dd` for the org-local day containing `instant`.
 *
 * This is the format payroll_payments.week_start is stored in, so it is the one
 * function whose output ends up in the database. It must never be produced with
 * `format(date)` from date-fns, which renders in device-local time.
 */
export function orgDateKey(instant: Date, timeZone: string): string {
  const { y, m, d } = orgYMD(instant, timeZone);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
