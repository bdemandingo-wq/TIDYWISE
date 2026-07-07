
-- Block owner self-upgrade on organizations
CREATE OR REPLACE FUNCTION public.block_org_billing_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type
     OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
     OR NEW.grandfathered_lifetime IS DISTINCT FROM OLD.grandfathered_lifetime
     OR NEW.stripe_schedule_id IS DISTINCT FROM OLD.stripe_schedule_id THEN
    RAISE EXCEPTION 'Billing fields (plan_type, plan_tier, grandfathered_lifetime, stripe_schedule_id) can only be updated by billing webhooks'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_block_billing_self_update ON public.organizations;
CREATE TRIGGER organizations_block_billing_self_update
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.block_org_billing_self_update();

-- Block user self-upgrade on profiles
CREATE OR REPLACE FUNCTION public.block_profile_subscription_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'Subscription fields (subscription_status, subscription_tier) can only be updated by billing webhooks'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_subscription_self_update ON public.profiles;
CREATE TRIGGER profiles_block_subscription_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.block_profile_subscription_self_update();
