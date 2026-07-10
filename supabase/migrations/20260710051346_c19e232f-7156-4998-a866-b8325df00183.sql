
-- Restore missing table-level grants on public.staff.
-- A prior migration recreated/altered the table and left it without
-- privileges for the authenticated role, causing "permission denied
-- for table staff" errors across scheduler, staff list, payroll, etc.
-- RLS policies still enforce per-row org isolation.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
