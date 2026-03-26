CREATE POLICY "Staff can update own signatures"
  ON public.staff_signatures
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());