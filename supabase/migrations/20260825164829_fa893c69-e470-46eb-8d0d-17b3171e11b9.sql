ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS needs_onboarding BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.needs_onboarding IS
  'Flag set to true for organizations created by provision-trial-org; false for all existing organizations.';