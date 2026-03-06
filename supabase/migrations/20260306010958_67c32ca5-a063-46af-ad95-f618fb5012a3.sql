
-- Sync booking_team_assignments.pay_share with bookings.cleaner_pay_expected
-- for single-cleaner bookings where pay_share is stale/incorrect
UPDATE booking_team_assignments bta
SET pay_share = b.cleaner_pay_expected
FROM bookings b
WHERE bta.booking_id = b.id
  AND b.cleaner_pay_expected IS NOT NULL
  AND bta.pay_share IS NOT NULL
  AND bta.pay_share != b.cleaner_pay_expected
  AND bta.is_primary = true
  -- Only for single-cleaner bookings (not true team splits)
  AND NOT EXISTS (
    SELECT 1 FROM booking_team_assignments bta2
    WHERE bta2.booking_id = bta.booking_id
      AND bta2.staff_id != bta.staff_id
  )
