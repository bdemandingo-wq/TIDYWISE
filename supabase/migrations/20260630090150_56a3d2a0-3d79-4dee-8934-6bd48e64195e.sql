
-- Restore SELECT on public.staff for authenticated (RLS still scopes rows to org admins / the staff member themself).
-- A prior security tightening revoked table-level SELECT, which broke the Payroll page.
-- Re-grant table SELECT, then revoke column-level SELECT on the truly sensitive columns
-- (SSN last 4, EIN, tax document URL, home address/coords). Org admins must use a
-- security-definer RPC if they ever need those fields.

GRANT SELECT ON public.staff TO authenticated;

REVOKE SELECT (ssn_last4, ein, tax_document_url, home_address, home_latitude, home_longitude)
  ON public.staff FROM authenticated, anon;
