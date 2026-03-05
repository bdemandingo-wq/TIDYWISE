-- Backfill cleaner_pay_expected for existing bookings with assigned cleaners

-- 1. Hourly: cleaner_wage * hours
UPDATE public.bookings
SET cleaner_pay_expected = ROUND(
  COALESCE(cleaner_wage, 0) * COALESCE(cleaner_override_hours, duration / 60.0), 2
),
pay_last_saved_at = now()
WHERE staff_id IS NOT NULL
  AND cleaner_pay_expected IS NULL
  AND status != 'cancelled'
  AND COALESCE(cleaner_wage_type, 'hourly') = 'hourly'
  AND cleaner_wage IS NOT NULL
  AND cleaner_wage > 0;

-- 2. Flat
UPDATE public.bookings
SET cleaner_pay_expected = ROUND(cleaner_wage::numeric, 2),
pay_last_saved_at = now()
WHERE staff_id IS NOT NULL
  AND cleaner_pay_expected IS NULL
  AND status != 'cancelled'
  AND cleaner_wage_type = 'flat'
  AND cleaner_wage IS NOT NULL
  AND cleaner_wage > 0;

-- 3. Percentage
UPDATE public.bookings
SET cleaner_pay_expected = ROUND((cleaner_wage / 100.0) * total_amount, 2),
pay_last_saved_at = now()
WHERE staff_id IS NOT NULL
  AND cleaner_pay_expected IS NULL
  AND status != 'cancelled'
  AND cleaner_wage_type = 'percentage'
  AND cleaner_wage IS NOT NULL
  AND cleaner_wage > 0;

-- 4. Use cleaner_actual_payment if set
UPDATE public.bookings
SET cleaner_pay_expected = cleaner_actual_payment,
pay_last_saved_at = now()
WHERE staff_id IS NOT NULL
  AND cleaner_pay_expected IS NULL
  AND status != 'cancelled'
  AND cleaner_actual_payment IS NOT NULL;

-- 5. Backfill from staff defaults
UPDATE public.bookings b
SET cleaner_pay_expected = ROUND(
  COALESCE(s.base_wage, s.hourly_rate, 0) * COALESCE(b.cleaner_override_hours, b.duration / 60.0), 2
),
cleaner_wage = COALESCE(s.base_wage, s.hourly_rate),
cleaner_wage_type = 'hourly',
pay_last_saved_at = now()
FROM public.staff s
WHERE b.staff_id = s.id
  AND b.cleaner_pay_expected IS NULL
  AND b.status != 'cancelled'
  AND b.staff_id IS NOT NULL
  AND COALESCE(s.base_wage, s.hourly_rate, 0) > 0;