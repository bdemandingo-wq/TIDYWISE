DROP FUNCTION IF EXISTS public.my_effective_plan();

CREATE OR REPLACE FUNCTION public.my_effective_plan()
RETURNS TABLE (plan_type text, raw_plan_type text, organization_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT m.organization_id INTO v_org
  FROM public.org_memberships m
  WHERE m.user_id = auth.uid()
  ORDER BY m.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'free'::text, 'free'::text, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT public.effective_plan(v_org),
         COALESCE((SELECT o.plan_type
                   FROM public.organizations o
                   WHERE o.id = v_org), 'free'),
         v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.my_effective_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_effective_plan() TO authenticated;