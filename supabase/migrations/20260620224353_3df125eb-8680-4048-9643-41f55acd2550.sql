
UPDATE public.organizations
SET plan_type = 'lifetime',
    grandfathered_lifetime = true,
    grandfathered_at = COALESCE(grandfathered_at, now())
WHERE id = '484d1e10-c869-4bdc-b907-564c05339397';

INSERT INTO public.lifetime_access_purchases
  (email, user_id, organization_id, stripe_session_id, amount_cents)
SELECT 'getfreshlyhome@gmail.com',
       'ffa1d629-3f01-4823-b269-84f597cee23c',
       '484d1e10-c869-4bdc-b907-564c05339397',
       'manual_grant_will_straka_20260620',
       30000
WHERE NOT EXISTS (
  SELECT 1 FROM public.lifetime_access_purchases
  WHERE email = 'getfreshlyhome@gmail.com'
);

INSERT INTO public.stripe_subscriptions
  (organization_id, stripe_subscription_id, stripe_customer_id, status, plan, current_period_end)
VALUES
  ('484d1e10-c869-4bdc-b907-564c05339397',
   'lifetime_manual_will_straka_20260620',
   NULL, 'active', 'lifetime', NULL)
ON CONFLICT (stripe_subscription_id) DO NOTHING;

DO $$
BEGIN
  PERFORM public.claim_lifetime_spot();
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
