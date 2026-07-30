-- 1. Widen financial access to owner + manager
CREATE OR REPLACE FUNCTION public.has_org_financial_access(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  );
$function$;

-- 2. invoices.created_by (audit)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

COMMENT ON COLUMN public.invoices.created_by IS
  'Auth user who created the invoice. Added 2026-07-30 for authorship auditing; NULL for rows created before that date and for service_role/edge-function inserts.';

-- 3. Drop permissive org-member policies on invoices / invoice_items
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated org members can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can create invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Users can update invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete invoices in their organization" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated org admins can manage invoices" ON public.invoices;

DROP POLICY IF EXISTS "Users can view invoice items in their org" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can create invoice items in their org" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can update invoice items in their org" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can delete invoice items in their org" ON public.invoice_items;

-- 4. RESTRICTIVE gate: a future permissive policy cannot reopen these tables
DROP POLICY IF EXISTS "Restrict invoices to financial access or own customer" ON public.invoices;
CREATE POLICY "Restrict invoices to financial access or own customer"
ON public.invoices
AS RESTRICTIVE
FOR ALL
TO public
USING (
  public.has_org_financial_access(organization_id)
  OR (
    customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = invoices.customer_id
        AND c.user_id = auth.uid()
        AND c.organization_id = invoices.organization_id
    )
  )
)
WITH CHECK (public.has_org_financial_access(organization_id));

DROP POLICY IF EXISTS "Restrict invoice items to financial access or own customer" ON public.invoice_items;
CREATE POLICY "Restrict invoice items to financial access or own customer"
ON public.invoice_items
AS RESTRICTIVE
FOR ALL
TO public
USING (
  public.has_org_financial_access(organization_id)
  OR EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    WHERE i.id = invoice_items.invoice_id
      AND c.user_id = auth.uid()
      AND c.organization_id = invoice_items.organization_id
  )
)
WITH CHECK (public.has_org_financial_access(organization_id));

-- 5. Tips: handled separately, staff self-read by assignment
DROP POLICY IF EXISTS "Org members can view tips" ON public.tips;
DROP POLICY IF EXISTS "Org members can update tips" ON public.tips;

DROP POLICY IF EXISTS "Staff can view tips for their assigned jobs" ON public.tips;
CREATE POLICY "Staff can view tips for their assigned jobs"
ON public.tips
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.booking_team_assignments bta
    JOIN public.staff s ON s.id = bta.staff_id
    WHERE bta.booking_id = tips.booking_id
      AND s.user_id = auth.uid()
      AND s.organization_id = tips.organization_id
  )
);
