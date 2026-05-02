-- Document the two public.* tables intentionally left with RLS enabled
-- and zero policies. Both are service-role-only by design — the linter
-- finding 0008_rls_enabled_no_policy will continue to flag them, and
-- that's acceptable given the comment.
--
-- A static audit of every migration found exactly 2 tables in this state:
--
--   * demo_reminder_log    — internal cron / edge-function log only.
--                            Per migration 20260428081658, intentionally
--                            no client-side policies.
--   * org_stripe_secrets   — Stripe credentials store, created by
--                            migration 20260501000000_split_stripe_secrets.
--                            Service-role-only by design; access goes
--                            through SECURITY DEFINER RPCs.
--
-- All 121 other RLS-enabled public tables already have at least one
-- CREATE POLICY in the migration history; no further work needed for
-- finding 0008.

COMMENT ON TABLE public.demo_reminder_log IS
  'Service-role only. No client-side policies by design. Internal cron / edge-function log; service_role bypasses RLS.';

COMMENT ON TABLE public.org_stripe_secrets IS
  'Service-role only. No client-side policies by design. Stripe secrets store; access only via SECURITY DEFINER RPCs (get_org_stripe_secret, find_org_by_stripe_secret).';
