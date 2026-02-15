/**
 * Shared wage calculation logic used by both:
 * - Admin Payroll page
 * - Cleaner Portal Earnings
 *
 * This ensures both views always show identical numbers.
 */

export interface WageBooking {
  cleaner_actual_payment: number | null;
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  cleaner_checkin_at: string | null;
  cleaner_checkout_at: string | null;
  cleaner_override_hours: number | null;
  duration: number;
  total_amount: number;
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
 * Calculate the wage for a single booking.
 * Priority: actual_payment → wage_type calc (flat / percentage / hourly)
 */
export function calculateBookingWage(booking: WageBooking, staff?: WageStaff | null): WageResult {
  const hoursWorked = getActualHours(booking, staff);

  // If an explicit actual payment was recorded, use it
  if (booking.cleaner_actual_payment != null && booking.cleaner_actual_payment > 0) {
    return {
      calculatedPay: Number(booking.cleaner_actual_payment),
      hoursWorked,
      wageType: 'actual',
      wageRate: Number(booking.cleaner_actual_payment),
    };
  }

  const wageType = booking.cleaner_wage_type || 'hourly';
  const wageRate = booking.cleaner_wage || staff?.base_wage || staff?.hourly_rate || 0;

  let calculatedPay = 0;

  if (wageType === 'flat') {
    calculatedPay = Number(wageRate);
  } else if (wageType === 'percentage') {
    calculatedPay = (Number(booking.total_amount) * Number(wageRate)) / 100;
  } else {
    // hourly
    calculatedPay = Number(wageRate) * hoursWorked;
  }

  return {
    calculatedPay: Math.round(calculatedPay * 100) / 100,
    hoursWorked,
    wageType,
    wageRate: Number(wageRate),
  };
}
