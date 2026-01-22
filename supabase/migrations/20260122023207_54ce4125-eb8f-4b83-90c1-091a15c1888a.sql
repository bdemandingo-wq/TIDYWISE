-- Add policy for org members to view customers for invoicing
-- This allows non-admin org members to view customers in their organization

CREATE POLICY "Org members can view customers" 
ON public.customers 
FOR SELECT 
USING (is_org_member(organization_id));