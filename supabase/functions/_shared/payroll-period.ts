// Deno-compatible payroll-period math.
// Mirrors src/lib/payrollPeriod.ts (which uses date-fns) using plain Date math
// so the edge function can compute period windows in each org's local timezone.

export interface PayrollPeriodConfig {
  payroll_frequency: "weekly" | "biweekly";
  payroll_start_day: number; // 0=Sun … 6=Sat
  payroll_custom_days: number[] | null; // weekly only — days to INCLUDE in the period
}

export const DEFAULT_PAYROLL_CONFIG: PayrollPeriodConfig = {
  payroll_frequency: "weekly",
  payroll_start_day: 1, // Monday
  payroll_custom_days: null,
};

const MS_PER_DAY = 86_400_000;

/** Returns the period-end day-of-week (0–6) for the given config. */
export function getEndDay(config: PayrollPeriodConfig): number {
  const span = config.payroll_frequency === "biweekly" ? 13 : 6;
  return (config.payroll_start_day + span) % 7;
}

/**
 * Returns the calendar date currently observed in `tz`, as a UTC-midnight Date
 * representing that local Y/M/D. Lets us reason about "what day is it for them"
 * without dragging timezone offsets through the rest of the math.
 */
export function calendarDateInTz(now: Date, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return new Date(Date.UTC(y, m - 1, d));
}

/** Day-of-week (0–6) for a UTC-midnight date returned by calendarDateInTz. */
export function dayOfWeekUtc(date: Date): number {
  return date.getUTCDay();
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Anchor for biweekly periods. 2024-01-01 was a Monday. Same anchor as
 * src/lib/payrollPeriod.ts — keeps the UI and the cron in agreement.
 */
const BIWEEKLY_ANCHOR_UTC = Date.UTC(2024, 0, 1);

/**
 * Returns the start date of the payroll period that contains `date`.
 * `date` should be a UTC-midnight Date representing a calendar day.
 */
export function getPeriodStart(date: Date, config: PayrollPeriodConfig): Date {
  const currentDay = date.getUTCDay();
  let diff = currentDay - config.payroll_start_day;
  if (diff < 0) diff += 7;

  if (config.payroll_frequency === "biweekly") {
    const candidateStart = addDaysUtc(date, -diff);
    const daysSinceAnchor = Math.floor(
      (candidateStart.getTime() - BIWEEKLY_ANCHOR_UTC) / MS_PER_DAY,
    );
    const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
    // Odd parity → step back another week so periods align on 14-day boundaries.
    if (weeksSinceAnchor % 2 !== 0) {
      return addDaysUtc(candidateStart, -7);
    }
    return candidateStart;
  }

  return addDaysUtc(date, -diff);
}

export function getPeriodEnd(periodStart: Date, config: PayrollPeriodConfig): Date {
  const span = config.payroll_frequency === "biweekly" ? 13 : 6;
  return addDaysUtc(periodStart, span);
}

export function getPreviousPeriod(
  periodStart: Date,
  config: PayrollPeriodConfig,
): { start: Date; end: Date } {
  const span = config.payroll_frequency === "biweekly" ? 14 : 7;
  const prevStart = addDaysUtc(periodStart, -span);
  return { start: prevStart, end: getPeriodEnd(prevStart, config) };
}

/**
 * True if `today` (UTC-midnight calendar day in org tz) is the closing day of
 * a real period — i.e. today's day-of-week equals the config's end day AND
 * (for biweekly) today aligns to the 14-day anchor parity.
 */
export function isPeriodEndDay(
  today: Date,
  config: PayrollPeriodConfig,
): boolean {
  if (today.getUTCDay() !== getEndDay(config)) return false;
  if (config.payroll_frequency === "biweekly") {
    const start = getPeriodStart(today, config);
    return getPeriodEnd(start, config).getTime() === today.getTime();
  }
  return true;
}

export function formatPeriodLabel(start: Date, end: Date): string {
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const fmtMonthDay = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  if (sameYear) {
    return `${fmtMonthDay(start)} – ${fmtMonthDay(end)}, ${end.getUTCFullYear()}`;
  }
  return `${fmtMonthDay(start)}, ${start.getUTCFullYear()} – ${fmtMonthDay(end)}, ${end.getUTCFullYear()}`;
}

/** YYYY-MM-DD string from a UTC-midnight Date — for DB DATE columns. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
