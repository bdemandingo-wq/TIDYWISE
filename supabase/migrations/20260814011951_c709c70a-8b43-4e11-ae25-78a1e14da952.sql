ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_answers jsonb;

COMMENT ON COLUMN public.organizations.onboarding_answers IS
  'Onboarding qualifying answers, captured once at organization creation. Shape: {"teamSize":[],"bookingMethod":[],"biggestPain":[],"revenueGoal":[],"howHeard":[]} — every value is an array of option slugs because the questions are multi-select. Forward-looking only: NULL for organizations created before 2026-08-13, and deliberately never backfilled.';