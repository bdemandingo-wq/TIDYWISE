-- Per-org configurable recurring booking discount percentages.
--
-- Stored as percentages (15 = 15%, NOT 0.15). Range 0-99 enforced via CHECK.
-- New orgs get the spec defaults: 0 / 5 / 15 / 20. Existing orgs are backfilled
-- with the values that were hardcoded in src/data/pricingData.ts before this
-- migration (0 / 15 / 25 / 30) so day-of-deploy nothing changes for them —
-- the user's spec said "Migration must backfill existing orgs with current
-- hardcoded defaults so nothing breaks." Since pricingData.ts is the canonical
-- admin-form source, those are the values we preserve.
--
-- Note: PublicBookingPage previously had its own different hardcoded values
-- (20/15/10). After this migration both surfaces read from these columns.

DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN recurring_discount_one_time NUMERIC NOT NULL DEFAULT 0
    CHECK (recurring_discount_one_time >= 0 AND recurring_discount_one_time <= 99);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN recurring_discount_monthly NUMERIC NOT NULL DEFAULT 5
    CHECK (recurring_discount_monthly >= 0 AND recurring_discount_monthly <= 99);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN recurring_discount_biweekly NUMERIC NOT NULL DEFAULT 15
    CHECK (recurring_discount_biweekly >= 0 AND recurring_discount_biweekly <= 99);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN recurring_discount_weekly NUMERIC NOT NULL DEFAULT 20
    CHECK (recurring_discount_weekly >= 0 AND recurring_discount_weekly <= 99);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Backfill existing rows with the prior admin-form behavior (pricingData.ts
-- values) instead of the spec defaults, so existing orgs see zero behavior
-- change on deploy day. Only touches rows where the columns landed at the
-- DEFAULT — orgs that were created post-migration already have the right
-- values.
UPDATE public.business_settings
SET
  recurring_discount_one_time = 0,
  recurring_discount_monthly  = 15,
  recurring_discount_biweekly = 25,
  recurring_discount_weekly   = 30
WHERE
  recurring_discount_one_time = 0
  AND recurring_discount_monthly = 5
  AND recurring_discount_biweekly = 15
  AND recurring_discount_weekly = 20;
