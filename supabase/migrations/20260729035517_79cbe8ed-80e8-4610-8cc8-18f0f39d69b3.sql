DROP POLICY IF EXISTS "Staff can insert own signatures" ON public.staff_signatures;

CREATE POLICY "Staff can insert own signatures"
ON public.staff_signatures
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM staff s
    WHERE s.id = staff_signatures.staff_id
      AND s.user_id = auth.uid()
      AND s.organization_id = staff_signatures.organization_id
  )
);