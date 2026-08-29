ALTER TABLE public.bookings DROP COLUMN payroll_date;

ALTER TABLE public.bookings
  ADD COLUMN payroll_date timestamptz
  GENERATED ALWAYS AS (COALESCE(completed_at, scheduled_at)) STORED;

CREATE INDEX idx_bookings_org_payroll_date
  ON public.bookings USING btree (organization_id, payroll_date DESC);