DROP POLICY IF EXISTS "Staff can update own signatures" ON public.staff_signatures;
REVOKE UPDATE ON public.staff_signatures FROM authenticated;
REVOKE UPDATE ON public.staff_signatures FROM anon;