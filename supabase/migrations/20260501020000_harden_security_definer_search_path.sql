-- Harden remaining SECURITY DEFINER functions with explicit search_path.
--
-- A static audit of every SECURITY DEFINER function in the public schema
-- showed 65 of 70 already declare `SET search_path = ...` in their body.
-- The four below — the pgmq email-queue wrappers — are SECURITY DEFINER
-- but were created without an explicit search_path. That leaves them open
-- to search_path injection: a caller who controls their own session
-- search_path could put a shadow function in front of `pgmq.send`,
-- `pgmq.read`, etc. and trick the wrapper into calling it.
--
-- These functions are EXECUTE-restricted to service_role by the prior
-- lockdown migration (20260501010000_lockdown_security_definer_execute.sql),
-- so the practical attack surface is small. ALTER FUNCTION ... SET below
-- closes the gap regardless.
--
-- Scope note: this migration does NOT change EXECUTE grants. It does NOT
-- flip any function from DEFINER to INVOKER. Both of those changes need
-- per-function body review and a live smoke test that this session can't
-- run; they're tracked as separate follow-ups (the scheduled May 15 agent
-- handles the client-portal RPC route-through-edge-function refactor,
-- which is the bulk of the remaining authenticated-callable surface).

ALTER FUNCTION public.enqueue_email(text, jsonb)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.read_email_batch(text, int, int)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.delete_email(text, bigint)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)
  SET search_path = public, pg_temp;

-- ──────────────────────────────────────────────────────────────────────────
-- Two SECURITY INVOKER trigger functions also lack explicit search_path.
-- They run on every INSERT/UPDATE on user-touched tables, so the linter
-- (0011_function_search_path_mutable) flags them even though they're
-- INVOKER. Both bodies use only built-ins — public, pg_temp is sufficient.
-- ──────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.set_customer_referral_code()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;
