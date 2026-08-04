CREATE OR REPLACE FUNCTION public.get_my_staff_profile(p_organization_id uuid DEFAULT NULL)
 RETURNS TABLE(id uuid, name text, email text, phone text, bio text, avatar_url text, hourly_rate numeric, base_wage numeric, percentage_rate numeric, tax_classification text, default_hours numeric, home_address text, home_latitude double precision, home_longitude double precision, organization_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.email, s.phone, s.bio, s.avatar_url,
         s.hourly_rate, s.base_wage, s.percentage_rate, s.tax_classification,
         s.default_hours, s.home_address, s.home_latitude, s.home_longitude,
         s.organization_id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  ORDER BY s.created_at ASC
  LIMIT 1;
$function$;

DROP FUNCTION IF EXISTS public.get_my_staff_profile();

REVOKE ALL ON FUNCTION public.get_my_staff_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_profile(uuid) TO authenticated;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_user_id_organization_id_key UNIQUE (user_id, organization_id);