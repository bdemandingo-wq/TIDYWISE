import { describe, it, expect } from 'vitest';
import { calculateBookingWage, getActualHours, type WageBooking, type WageStaff } from '@/lib/wageCalculation';

const makeBooking = (overrides: Partial<WageBooking> = {}): WageBooking => ({
  cleaner_actual_payment: null,
  cleaner_wage: null,
  cleaner_wage_type: null,
  cleaner_checkin_at: null,
  cleaner_checkout_at: null,
  cleaner_override_hours: null,
  duration: 120, // 2 hours in minutes
  total_amount: 200,
  ...overrides,
});

const makeStaff = (overrides: Partial<WageStaff> = {}): WageStaff => ({
  base_wage: null,
  hourly_rate: 25,
  default_hours: null,
  ...overrides,
});

describe('getActualHours', () => {
  it('uses check-in/out timestamps when available', () => {
    const booking = makeBooking({
      cleaner_checkin_at: '2026-02-10T09:00:00Z',
      cleaner_checkout_at: '2026-02-10T12:30:00Z',
    });
    expect(getActualHours(booking)).toBeCloseTo(3.5);
  });

  it('falls back to override hours', () => {
    const booking = makeBooking({ cleaner_override_hours: 4 });
    expect(getActualHours(booking)).toBe(4);
  });

  it('falls back to staff default_hours', () => {
    const booking = makeBooking();
    const staff = makeStaff({ default_hours: 6 });
    expect(getActualHours(booking, staff)).toBe(6);
  });

  it('falls back to duration in hours', () => {
    const booking = makeBooking({ duration: 180 });
    expect(getActualHours(booking)).toBe(3);
  });

  it('priority: timestamps > override > default > duration', () => {
    const booking = makeBooking({
      cleaner_checkin_at: '2026-02-10T08:00:00Z',
      cleaner_checkout_at: '2026-02-10T09:30:00Z',
      cleaner_override_hours: 5,
      duration: 240,
    });
    const staff = makeStaff({ default_hours: 8 });
    // Timestamps win → 1.5h
    expect(getActualHours(booking, staff)).toBeCloseTo(1.5);
  });
});

describe('calculateBookingWage', () => {
  it('uses explicit actual_payment when set', () => {
    const booking = makeBooking({ cleaner_actual_payment: 100 });
    const result = calculateBookingWage(booking, makeStaff());
    expect(result.calculatedPay).toBe(100);
    expect(result.wageType).toBe('actual');
  });

  it('ignores actual_payment of 0', () => {
    const booking = makeBooking({ cleaner_actual_payment: 0, cleaner_wage: 30, cleaner_wage_type: 'hourly' });
    const result = calculateBookingWage(booking);
    // Should NOT use 0 as actual, should calculate from hourly
    expect(result.calculatedPay).toBeGreaterThan(0);
    expect(result.wageType).toBe('hourly');
  });

  it('calculates hourly pay from timestamps', () => {
    const booking = makeBooking({
      cleaner_checkin_at: '2026-02-10T09:00:00Z',
      cleaner_checkout_at: '2026-02-10T11:00:00Z', // 2 hours
      cleaner_wage: 50,
      cleaner_wage_type: 'hourly',
    });
    const result = calculateBookingWage(booking);
    expect(result.calculatedPay).toBe(100); // 2h × $50
    expect(result.hoursWorked).toBeCloseTo(2);
  });

  it('calculates flat rate pay', () => {
    const booking = makeBooking({ cleaner_wage: 150, cleaner_wage_type: 'flat' });
    const result = calculateBookingWage(booking);
    expect(result.calculatedPay).toBe(150);
  });

  it('calculates percentage pay', () => {
    const booking = makeBooking({
      cleaner_wage: 50, // 50%
      cleaner_wage_type: 'percentage',
      total_amount: 200,
    });
    const result = calculateBookingWage(booking);
    expect(result.calculatedPay).toBe(100); // 50% of $200
  });

  it('falls back to staff hourly_rate when booking wage is null', () => {
    const booking = makeBooking({
      cleaner_checkin_at: '2026-02-10T09:00:00Z',
      cleaner_checkout_at: '2026-02-10T11:00:00Z',
    });
    const staff = makeStaff({ hourly_rate: 30 });
    const result = calculateBookingWage(booking, staff);
    expect(result.calculatedPay).toBe(60); // 2h × $30
  });

  it('returns 0 when no wage info exists', () => {
    const booking = makeBooking();
    const staff = makeStaff({ hourly_rate: null, base_wage: null });
    const result = calculateBookingWage(booking, staff);
    expect(result.calculatedPay).toBe(0);
  });

  it('portal and payroll get identical results for same inputs', () => {
    const booking = makeBooking({
      cleaner_checkin_at: '2026-02-10T08:00:00Z',
      cleaner_checkout_at: '2026-02-10T11:30:00Z',
      cleaner_wage: 25,
      cleaner_wage_type: 'hourly',
    });
    const staff = makeStaff({ hourly_rate: 25 });

    // Simulate portal call
    const portalResult = calculateBookingWage(booking, staff);
    // Simulate payroll call (exact same function now)
    const payrollResult = calculateBookingWage(booking, staff);

    expect(portalResult.calculatedPay).toBe(payrollResult.calculatedPay);
    expect(portalResult.hoursWorked).toBe(payrollResult.hoursWorked);
  });
});
