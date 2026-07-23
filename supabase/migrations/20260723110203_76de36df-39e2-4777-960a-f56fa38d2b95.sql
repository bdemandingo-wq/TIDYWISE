-- Fix the customers UPDATE policy so the new row is still scoped to the admin's organization.
DROP POLICY IF EXISTS "Admins can update customers" ON public.customers;
CREATE POLICY "Admins can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

-- Fix the invoices UPDATE policies so the new row cannot be moved to another tenant.
DROP POLICY IF EXISTS "Users can update invoices in their organization" ON public.invoices;
CREATE POLICY "Users can update invoices in their organization"
ON public.invoices
FOR UPDATE
TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Financial: owner+admin only" ON public.invoices;
CREATE POLICY "Financial: owner+admin only"
ON public.invoices
FOR ALL
TO authenticated
USING (public.has_org_financial_access(organization_id))
WITH CHECK (public.has_org_financial_access(organization_id));