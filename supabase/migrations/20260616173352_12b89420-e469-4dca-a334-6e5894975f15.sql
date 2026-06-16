CREATE TABLE public.sentry_dismissed_issues (
  issue_id TEXT PRIMARY KEY,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at_dismiss TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentry_dismissed_issues TO authenticated;
GRANT ALL ON public.sentry_dismissed_issues TO service_role;

ALTER TABLE public.sentry_dismissed_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin can view dismissed sentry issues"
  ON public.sentry_dismissed_issues FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'support@tidywisecleaning.com');

CREATE POLICY "Platform admin can insert dismissed sentry issues"
  ON public.sentry_dismissed_issues FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = 'support@tidywisecleaning.com');

CREATE POLICY "Platform admin can update dismissed sentry issues"
  ON public.sentry_dismissed_issues FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'support@tidywisecleaning.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'support@tidywisecleaning.com');

CREATE POLICY "Platform admin can delete dismissed sentry issues"
  ON public.sentry_dismissed_issues FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'support@tidywisecleaning.com');