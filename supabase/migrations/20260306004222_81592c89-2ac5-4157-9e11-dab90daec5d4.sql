
-- Add missing pay snapshot fields to bookings
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS pay_base_mode text DEFAULT 'subtotal_after_discount_before_tip',
  ADD COLUMN IF NOT EXISTS pay_base_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pay_last_saved_by uuid DEFAULT NULL;

-- Backfill cleaner_pay_expected for all bookings that have pay info but missing expected pay
UPDATE public.bookings
SET cleaner_pay_expected = CASE
  WHEN cleaner_actual_payment IS NOT NULL THEN cleaner_actual_payment
  WHEN cleaner_wage_type = 'flat' THEN COALESCE(cleaner_wage, 0)
  WHEN cleaner_wage_type = 'percentage' THEN (COALESCE(cleaner_wage, 0) / 100.0) * COALESCE(subtotal - COALESCE(discount_amount, 0), total_amount)
  WHEN cleaner_wage_type = 'hourly' OR cleaner_wage_type IS NULL THEN COALESCE(cleaner_wage, 0) * COALESCE(cleaner_override_hours, duration / 60.0)
  ELSE 0
END
WHERE cleaner_pay_expected IS NULL
  AND (cleaner_wage IS NOT NULL OR cleaner_actual_payment IS NOT NULL);
