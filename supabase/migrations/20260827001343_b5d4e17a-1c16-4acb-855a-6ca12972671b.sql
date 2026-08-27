UPDATE public.lifetime_offer_state SET total_spots = 100, updated_at = now() WHERE id = 1;

CREATE OR REPLACE FUNCTION public.get_lifetime_spots_remaining()
 RETURNS TABLE(total integer, sold integer, remaining integer, sold_out boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    100::int AS total,
    COALESCE(c.cnt, 0)::int AS sold,
    GREATEST(0, 100 - COALESCE(c.cnt, 0))::int AS remaining,
    (COALESCE(c.cnt, 0) >= 100) AS sold_out
  FROM (
    SELECT COUNT(*)::int AS cnt
    FROM public.lifetime_access_purchases
  ) c;
$function$;