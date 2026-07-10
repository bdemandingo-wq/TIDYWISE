ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS payroll_report_send_day smallint NULL
  CHECK (payroll_report_send_day IS NULL OR (payroll_report_send_day BETWEEN 0 AND 6));

COMMENT ON COLUMN public.business_settings.payroll_report_send_day IS
  'Day of week (0=Sun..6=Sat) to send the payroll period summary email. NULL = default (send on period end day, current behavior).';