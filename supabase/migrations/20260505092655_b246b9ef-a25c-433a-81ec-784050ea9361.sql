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

DO $$ BEGIN
  ALTER TABLE public.business_settings
    ADD COLUMN payroll_report_send_hour SMALLINT NOT NULL DEFAULT 20
    CHECK (payroll_report_send_hour BETWEEN 0 AND 23);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;