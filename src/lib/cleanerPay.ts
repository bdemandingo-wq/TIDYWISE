import { supabase } from '@/lib/supabase';

/**
 * The single source of truth for computing a booking's cleaner_pay_expected
 * (the payroll pay snapshot) from wage inputs. Every write site that sets
 * cleaner pay must use this so the value can never diverge between paths.
 *
 * - flat:       the wage IS the dollar amount
 * - percentage: wage% of the charged base (finalPrice / total)
 * - hourly:     wage × hours (override hours, else serviceDuration/60)
 *
 * Returns null when no wage is configured (0 / empty), which lets payroll
 * fall back to cleaner_actual_payment or the computed default.
 */
export function computeExpectedPay(
  wageType: string,
  wage: string,
  overrideHours: string,
  serviceDuration: number,
  baseAmount: number,
): number | null {
  const w = wage ? parseFloat(wage) : null;
  if (w == null || w === 0 || isNaN(w)) return null;
  if (wageType === 'flat') return w;
  if (wageType === 'percentage') return Math.round((w / 100) * baseAmount * 100) / 100;
  // hourly
  const hours = overrideHours ? parseFloat(overrideHours) : (serviceDuration / 60);
  return Math.round(w * hours * 100) / 100;
}

/**
 * Keep booking_team_assignments.pay_share in sync with a booking-level cleaner
 * pay change. Payroll (PayrollPage.calcWage, payroll-period-process) reads
 * pay_share FIRST and as a dollar amount, so a stale value silently shows the
 * wrong pay.
 *
 * Only single-cleaner bookings are touched: if the booking has 0 assignments
 * (payroll then uses cleaner_pay_expected) or 2+ (a real team, whose pay_share
 * is per-member) we leave it alone rather than clobbering it with a
 * booking-level value.
 */
export async function syncCleanerPayShare(
  bookingId: string,
  organizationId: string | null | undefined,
  expectedPay: number | null,
): Promise<void> {
  let sel = supabase
    .from('booking_team_assignments')
    .select('id')
    .eq('booking_id', bookingId);
  if (organizationId) sel = sel.eq('organization_id', organizationId);
  const { data, error } = await sel;
  if (error || !data || data.length !== 1) return; // no row, or a team → leave alone

  let upd = supabase
    .from('booking_team_assignments')
    .update({ pay_share: expectedPay })
    .eq('booking_id', bookingId);
  if (organizationId) upd = upd.eq('organization_id', organizationId);
  await upd;
}
