-- Payroll week attribution must only move on MEASURED completion.
-- 'inferred_updated_at' and 'scheduled_fallback' are guesses derived from a
-- row's last-edit time; they were silently pushing jobs (e.g. booking #2031,
-- scheduled Aug 21, "completed" Aug 23 because the row was touched) out of the
-- week they were worked, so the cleaner's pay run came up short.
ALTER TABLE public.bookings DROP COLUMN payroll_date;

ALTER TABLE public.bookings
  ADD COLUMN payroll_date timestamptz
  GENERATED ALWAYS AS (
    CASE
      WHEN completed_at IS NOT NULL
       AND completed_at_source IN ('checkout', 'trigger')
        THEN completed_at
      ELSE scheduled_at
    END
  ) STORED;

CREATE INDEX idx_bookings_org_payroll_date
  ON public.bookings USING btree (organization_id, payroll_date DESC);