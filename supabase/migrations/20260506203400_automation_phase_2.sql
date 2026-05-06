-- Automation Phase 2: 4 new automation types + a fire-log table for dedupe.
-- Matches the existing organization_automations pattern — no new toggle table.

-- 1) Backfill rows for every existing org so the toggles render with state.
INSERT INTO public.organization_automations (organization_id, automation_type, is_enabled, description)
SELECT
  o.id,
  a.automation_type,
  false,
  a.description
FROM public.organizations o
CROSS JOIN (VALUES
  ('seasonal_promo',         'Sends promo SMS 3 days before major US holidays'),
  ('weekly_summary',         'Emails a weekly business digest every Monday'),
  ('recurring_lapse_alert',  'Alerts when a recurring booking didn''t generate'),
  ('quote_stale_reengage',   'Auto-follows up on quotes sitting unbooked for 3 days')
) AS a(automation_type, description)
ON CONFLICT (organization_id, automation_type) DO NOTHING;

-- 2) Fire log — single source of truth for "did we already nudge this target?"
--    Used by seasonal-promo-sender, recurring-booking-lapse-alert, and
--    quote-stale-reengage to dedupe.
CREATE TABLE IF NOT EXISTS public.automation_fire_log (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_automation_fire_log_dedupe
  ON public.automation_fire_log(organization_id, automation_type, target_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_fire_log_org_fired
  ON public.automation_fire_log(organization_id, fired_at DESC);

ALTER TABLE public.automation_fire_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org members can read fire log"
    ON public.automation_fire_log FOR SELECT
    USING (public.is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service-role-only INSERT — only edge functions write to this.
DO $$ BEGIN
  CREATE POLICY "Service role can insert fire log"
    ON public.automation_fire_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
