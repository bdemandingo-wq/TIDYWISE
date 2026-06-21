
CREATE OR REPLACE FUNCTION public.get_lifetime_spots_remaining()
RETURNS TABLE(total integer, sold integer, remaining integer, sold_out boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    50::int AS total,
    COALESCE(c.cnt, 0)::int AS sold,
    GREATEST(0, 50 - COALESCE(c.cnt, 0))::int AS remaining,
    (COALESCE(c.cnt, 0) >= 50) AS sold_out
  FROM (
    SELECT COUNT(*)::int AS cnt
    FROM public.organizations
    WHERE plan_type = 'lifetime'
  ) c;
$$;

GRANT EXECUTE ON FUNCTION public.get_lifetime_spots_remaining() TO anon, authenticated;
