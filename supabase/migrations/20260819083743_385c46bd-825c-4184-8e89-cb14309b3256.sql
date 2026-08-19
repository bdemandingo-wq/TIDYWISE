REVOKE EXECUTE ON FUNCTION public.set_leads_updated_by() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Clients can create own requests" ON public.client_booking_requests;
CREATE POLICY "Clients can create own requests"
ON public.client_booking_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = client_booking_requests.customer_id
      AND c.user_id = auth.uid()
      AND c.organization_id = client_booking_requests.organization_id
  )
);

DROP POLICY IF EXISTS "Clients can manage own portal feedback" ON public.client_portal_feedback;
CREATE POLICY "Clients can manage own portal feedback"
ON public.client_portal_feedback
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = client_portal_feedback.customer_id
      AND c.user_id = auth.uid()
      AND c.organization_id = client_portal_feedback.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = client_portal_feedback.customer_id
      AND c.user_id = auth.uid()
      AND c.organization_id = client_portal_feedback.organization_id
  )
);