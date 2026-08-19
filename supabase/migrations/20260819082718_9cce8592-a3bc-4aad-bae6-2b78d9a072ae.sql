ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS sender_user_id uuid;

CREATE OR REPLACE FUNCTION public.get_org_member_names(p_organization_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (om.user_id)
         om.user_id,
         COALESCE(
           NULLIF(TRIM(p.full_name), ''),
           NULLIF(TRIM(s.name), '')
         ) AS display_name
  FROM public.org_memberships om
  LEFT JOIN public.profiles p ON p.id = om.user_id
  LEFT JOIN public.staff    s ON s.user_id = om.user_id
                             AND s.organization_id = om.organization_id
  WHERE om.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1 FROM public.org_memberships me
      WHERE me.organization_id = p_organization_id
        AND me.user_id = auth.uid()
    )
  ORDER BY om.user_id, om.created_at ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_org_member_names(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_org_member_names(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_org_member_names(uuid) TO authenticated;