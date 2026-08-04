-- 1. staff.email is INSERT-only (service role writes it). Table-wide UPDATE
-- grant made the column-level revoke ineffective, so replace it with an
-- explicit column list that omits email.
REVOKE UPDATE ON public.staff FROM authenticated;
REVOKE UPDATE ON public.staff FROM anon;

GRANT UPDATE (
  id, user_id, name, phone, avatar_url, bio, is_active, hourly_rate,
  created_at, updated_at, tax_classification, base_wage, tax_document_url,
  ssn_last4, ein, percentage_rate, organization_id, calendar_color,
  default_hours, home_address, home_latitude, home_longitude,
  location_permission_status, location_permission_updated_at
) ON public.staff TO authenticated;

-- 2. payroll_payments: make owner-only real. Permissive policies OR together
-- and is_org_admin() accepts manager, so add a RESTRICTIVE gate that AND-s
-- against every present and future permissive policy.
DROP POLICY IF EXISTS "Financial restrict: owner only" ON public.payroll_payments;
CREATE POLICY "Financial restrict: owner only"
ON public.payroll_payments
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_org_financial_access(organization_id))
WITH CHECK (public.has_org_financial_access(organization_id));