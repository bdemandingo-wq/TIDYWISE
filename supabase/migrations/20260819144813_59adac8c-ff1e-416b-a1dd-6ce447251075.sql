REVOKE ALL ON FUNCTION public.list_org_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_org_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_org_members(uuid) TO authenticated;