/**
 * Shared wage calculation logic used by both:
 * - Admin Payroll page
 * - Cleaner Portal Earnings
 *
 * RULE: booking.cleaner_pay_expected is the SINGLE SOURCE OF TRUTH.
 * Never recompute pay from hours/rate if cleaner_pay_expected exists.
 * Only fall back to computation when cleaner_pay_expected is null.
 */

export interface WageBooking {
  cleaner_actual_payment: number | null;
  cleaner_pay_expected: number | null;
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  cleaner_checkin_at: string | null;
  cleaner_checkout_at: string | null;
  cleaner_override_hours: number | null;
  duration: number;
  total_amount: number;
  subtotal?: number | null;
  discount_amount?: number | null;
  pay_locked?: boolean | null;
}

export interface WageStaff {
  base_wage: number | null;
  hourly_rate: number | null;
  default_hours: number | null;
}

export interface WageResult {
  calculatedPay: number;
  hoursWorked: number;
  wageType: string;
  wageRate: number;
  isMissingPay: boolean;
}

/**
 * Get actual hours worked from check-in/out timestamps,
 * falling back to override → default hours → booking duration.
 */
export function getActualHours(booking: WageBooking, staff?: WageStaff | null): number {
  if (booking.cleaner_checkin_at && booking.cleaner_checkout_at) {
    const checkin = new Date(booking.cleaner_checkin_at).getTime();
    const checkout = new Date(booking.cleaner_checkout_at).getTime();
    return (checkout - checkin) / (1000 * 60 * 60);
  }
  return booking.cleaner_override_hours || staff?.default_hours || (booking.duration / 60);
}

/**
 * Compute pay from rate/type (used ONLY as fallback when cleaner_pay_expected is null).
 */
function computePayFromDefaults(booking: WageBooking, staff?: WageStaff | null): { pay: number; wageType: string; wageRate: number } {
  const wageType = booking.cleaner_wage_type || 'hourly';
  const wageRate = booking.cleaner_wage || staff?.base_wage || staff?.hourly_rate || 0;
  const hoursWorked = getActualHours(booking, staff);

  let pay = 0;
  if (wageType === 'flat') {
    pay = Number(wageRate);
  } else if (wageType === 'percentage') {
    const base = Number(booking.subtotal || booking.total_amount) - Number(booking.discount_amount || 0);
    pay = (Number(wageRate) / 100) * base;
  } else {
    // hourly
    pay = Number(wageRate) * hoursWorked;
  }

  return { pay: Math.round(pay * 100) / 100, wageType, wageRate: Number(wageRate) };
}

/**
 * Calculate the wage for a single booking.
 * 
 * Priority:
 * 1. cleaner_pay_expected (SINGLE SOURCE OF TRUTH — if set, use it)
 * 2. cleaner_actual_payment (legacy override — treat as expected pay)
 * 3. Fallback: compute from wage type/rate/hours (only when no snapshot exists)
 */
export function calculateBookingWage(booking: WageBooking, staff?: WageStaff | null): WageResult {
  const hoursWorked = getActualHours(booking, staff);
  const wageType = booking.cleaner_wage_type || 'hourly';
  const wageRate = Number(booking.cleaner_wage || staff?.base_wage || staff?.hourly_rate || 0);

  // 1. cleaner_pay_expected is the single source of truth
  if (booking.cleaner_pay_expected != null) {
    return {
      calculatedPay: Number(booking.cleaner_pay_expected),
      hoursWorked,
      wageType,
      wageRate,
      isMissingPay: false,
    };
  }

  // 2. Legacy: cleaner_actual_payment (explicit admin override, including $0)
  if (booking.cleaner_actual_payment != null) {
    return {
      calculatedPay: Number(booking.cleaner_actual_payment),
      hoursWorked,
      wageType: 'actual',
      wageRate: Number(booking.cleaner_actual_payment),
      isMissingPay: false,
    };
  }

  // 3. Fallback: compute from defaults (no pay snapshot exists)
  const fallback = computePayFromDefaults(booking, staff);
  return {
    calculatedPay: fallback.pay,
    hoursWorked,
    wageType: fallback.wageType,
    wageRate: fallback.wageRate,
    isMissingPay: true, // Flag: this booking has no saved pay snapshot
  };
}
