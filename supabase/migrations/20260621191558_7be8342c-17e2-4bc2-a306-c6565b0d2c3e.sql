
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_downgrade_scheduled_to text,
  ADD COLUMN IF NOT EXISTS plan_downgrade_date timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_schedule_id text;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_downgrade_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_downgrade_check
  CHECK (
    plan_downgrade_scheduled_to IS NULL
    OR plan_downgrade_scheduled_to = ANY (ARRAY['basic','pro','custom'])
  );
