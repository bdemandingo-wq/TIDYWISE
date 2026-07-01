
-- Backfill: anyone with a lifetime purchase should be on the lifetime plan.
UPDATE public.organizations o
SET plan_type = 'lifetime',
    grandfathered_lifetime = true
FROM public.lifetime_access_purchases lap
WHERE lap.organization_id = o.id
  AND (o.plan_type IS DISTINCT FROM 'lifetime' OR o.grandfathered_lifetime IS DISTINCT FROM true);

-- Trigger: auto-promote org on future lifetime purchases.
CREATE OR REPLACE FUNCTION public.promote_org_to_lifetime_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    UPDATE public.organizations
    SET plan_type = 'lifetime',
        grandfathered_lifetime = true
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_org_to_lifetime ON public.lifetime_access_purchases;
CREATE TRIGGER trg_promote_org_to_lifetime
AFTER INSERT ON public.lifetime_access_purchases
FOR EACH ROW EXECUTE FUNCTION public.promote_org_to_lifetime_on_purchase();
