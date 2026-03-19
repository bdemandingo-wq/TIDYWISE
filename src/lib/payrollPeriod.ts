import { addDays, startOfDay, format } from 'date-fns';

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
export function getPeriodStart(date: Date, config: PayrollPeriodConfig): Date {
  const d = startOfDay(date);
  const currentDay = d.getDay();
  let diff = currentDay - config.payroll_start_day;
  if (diff < 0) diff += 7;

  // For biweekly, we need a stable anchor. Use epoch-based calculation.
  if (config.payroll_frequency === 'biweekly') {
    // Anchor: find the most recent start day, then check if it's within a 14-day period
    const candidateStart = addDays(d, -diff);
    // Use a fixed anchor point (Jan 1, 2024 was a Monday)
    const anchor = new Date(2024, 0, 1); // Monday Jan 1 2024
    const daysSinceAnchor = Math.floor((candidateStart.getTime() - anchor.getTime()) / (86400000));
    const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
    // If weeksSinceAnchor is odd, go back one more week
    if (weeksSinceAnchor % 2 !== 0) {
      return addDays(candidateStart, -7);
    }
    return candidateStart;
  }

  return addDays(d, -diff);
}

export function getPeriodEnd(periodStart: Date, config: PayrollPeriodConfig): Date {
  const span = config.payroll_frequency === 'biweekly' ? 13 : 6;
  return addDays(periodStart, span);
}

export function getCurrentPeriod(config: PayrollPeriodConfig): { start: Date; end: Date } {
  const start = getPeriodStart(new Date(), config);
  return { start, end: getPeriodEnd(start, config) };
}

export function getNextPeriod(config: PayrollPeriodConfig): { start: Date; end: Date } {
  const current = getCurrentPeriod(config);
  const nextStart = addDays(current.end, 1);
  return { start: nextStart, end: getPeriodEnd(nextStart, config) };
}

export function formatPeriodLabel(start: Date, end: Date): string {
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

export function getPeriodTitle(config: PayrollPeriodConfig, which: 'current' | 'next'): string {
  if (config.payroll_frequency === 'biweekly') {
    return which === 'current' ? 'Current Bi-Weekly Period' : 'Next Bi-Weekly Period';
  }
  return which === 'current' ? 'Current Pay Period' : 'Next Pay Period';
}
