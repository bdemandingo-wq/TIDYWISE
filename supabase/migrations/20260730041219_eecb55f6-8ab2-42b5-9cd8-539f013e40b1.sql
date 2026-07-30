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
      AND role = 'owner'
  );
$function$;

COMMENT ON FUNCTION public.has_org_financial_access(uuid) IS
  'OWNER ONLY. Do not widen this. It is shared by a DO-loop policy across eleven financial tables (20260709144431:83-104), by organization_invites, and by list_org_members(), so widening it grants far more than the caller you are looking at. On 2026-07-30 it was briefly widened to include manager and silently exposed payroll, expenses, disputes, Stripe config and the member directory. If a specific table needs a broader role, grant it AT THAT TABLE.';

DROP POLICY IF EXISTS "Restrict invoices to financial access or own customer" ON public.invoices;
CREATE POLICY "Restrict invoices to financial access or own customer"
ON public.invoices
AS RESTRICTIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
  )
  OR (
    customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = invoices.customer_id
        AND c.user_id = auth.uid()
        AND c.organization_id = invoices.organization_id
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
  )
);

DROP POLICY IF EXISTS "Restrict invoice items to financial access or own customer" ON public.invoice_items;
CREATE POLICY "Restrict invoice items to financial access or own customer"
ON public.invoice_items
AS RESTRICTIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = invoice_items.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
  )
  OR EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    WHERE i.id = invoice_items.invoice_id
      AND c.user_id = auth.uid()
      AND c.organization_id = invoice_items.organization_id
  )
);