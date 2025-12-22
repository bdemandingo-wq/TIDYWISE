-- Allow staff to insert and update their own working hours
CREATE POLICY "Staff can insert own working hours"
ON public.working_hours
FOR INSERT
TO authenticated
WITH CHECK (
  staff_id IN (
    SELECT id FROM public.staff WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can update own working hours"
ON public.working_hours
FOR UPDATE
TO authenticated
USING (
  staff_id IN (
    SELECT id FROM public.staff WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  staff_id IN (
    SELECT id FROM public.staff WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can delete own working hours"
ON public.working_hours
FOR DELETE
TO authenticated
USING (
  staff_id IN (
    SELECT id FROM public.staff WHERE user_id = auth.uid()
  )
);