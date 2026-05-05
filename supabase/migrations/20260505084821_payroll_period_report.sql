-- Payroll period report email — schema additions
-- Adds 3 columns to business_settings for per-org report toggle / recipients / send hour.
-- Adds 3 columns to email_send_log so we can scope by org and dedupe per period.
-- Adds a partial unique index that prevents duplicate sends per org per period.
-- Adds a SELECT RLS policy on email_send_log so org owners/admins can see their own log entries.

-- 1) business_settings: report controls
DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN payroll_report_email_enabled BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN payroll_report_recipients TEXT[] NOT NULL DEFAULT '{}'::text[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Stored for future use; v1 cron fires once daily at 00:00 UTC and ignores this.
DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN payroll_report_send_hour SMALLINT NOT NULL DEFAULT 20
    CHECK (payroll_report_send_hour BETWEEN 0 AND 23);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2) email_send_log: scope by org + dedupe per period
DO $$ BEGIN
  ALTER TABLE public.email_send_log
    ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN period_start DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN period_end DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_org
  ON public.email_send_log(organization_id);

-- Dedupe: only one 'sent' payroll-period-report row per (org, period_end).
-- Race-safe net for the pre-send check inside the edge function.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_payroll_period_unique
  ON public.email_send_log(organization_id, period_end)
  WHERE template_name = 'payroll-period-report' AND status = 'sent';

-- 3) RLS: let owners/admins read their own org's send log
DO $$ BEGIN
  CREATE POLICY "Org owners/admins can read their org send log"
    ON public.email_send_log FOR SELECT
    USING (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = email_send_log.organization_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
