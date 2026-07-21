-- Rebuilds create_client_portal_referral. The original version of this
-- function (20260413160000_create_client_portal_referral.sql) never
-- actually applied to the live database — confirmed empirically via a
-- live anon RPC probe returning 404 PGRST202 "function not found", not
-- just absent from migration history. The client-portal-api edge
-- function's create_referral action has been calling this (missing)
-- function the whole time, and the portal UI's "Refer a friend" button
-- has been a dead end for every customer since launch.
--
-- Reuses the original's vetted business logic unchanged (resolve portal
-- user -> customer + org, block self-referral, block duplicate invites,
-- generate a collision-checked referral code, insert a pending referral
-- row with the standard $25 credit_amount default).
--
-- The one deliberate change from the original: grants. The original
-- granted EXECUTE directly to anon, authenticated — the same mistake
-- already fixed for the other 10 client-portal SECURITY DEFINER
-- functions (see 20260716140000_lockdown_client_portal_rpc_execute.sql).
-- client-portal-api already resolves p_portal_user_id from the verified
-- portal session token server-side before calling this RPC with the
-- service-role client (confirmed by reading its create_referral case),
-- so anon/authenticated access is neither needed nor safe here.

CREATE OR REPLACE FUNCTION public.create_client_portal_referral(
  p_portal_user_id UUID,
  p_referred_email  TEXT,
  p_referred_name   TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id     UUID;
  v_organization_id UUID;
  v_customer_email  TEXT;
  v_new_code        TEXT;
  v_referral_id     UUID;
BEGIN
  -- Resolve portal user -> customer + org
  SELECT cu.id, cu.organization_id, cu.email
  INTO   v_customer_id, v_organization_id, v_customer_email
  FROM   public.client_portal_users pu
  JOIN   public.customers cu ON cu.id = pu.customer_id
  WHERE  pu.id = p_portal_user_id
    AND  pu.is_active = true;

  IF v_customer_id IS NULL THEN
    RETURN json_build_object('error', 'Portal user not found or inactive');
  END IF;

  -- Prevent self-referral
  IF lower(trim(p_referred_email)) = lower(trim(v_customer_email)) THEN
    RETURN json_build_object('error', 'You cannot refer yourself');
  END IF;

  -- Prevent duplicate invite (same referrer + email within this org)
  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE  organization_id       = v_organization_id
      AND  referrer_customer_id  = v_customer_id
      AND  lower(referred_email) = lower(trim(p_referred_email))
  ) THEN
    RETURN json_build_object('error', 'You have already sent an invite to this email address');
  END IF;

  -- Generate a unique tracking code for this invite
  -- (distinct from the customer's generic share code on the customers table)
  v_new_code := upper(left(replace(v_customer_id::text, '-', ''), 8))
             || upper(left(replace(gen_random_uuid()::text, '-', ''), 4));

  -- Retry on collision (astronomically rare but safe)
  WHILE EXISTS (SELECT 1 FROM public.referrals WHERE referral_code = v_new_code) LOOP
    v_new_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 12));
  END LOOP;

  -- Create the referral row
  INSERT INTO public.referrals (
    organization_id,
    referrer_customer_id,
    referred_email,
    referred_name,
    referral_code,
    credit_amount,
    status
  ) VALUES (
    v_organization_id,
    v_customer_id,
    lower(trim(p_referred_email)),
    nullif(trim(coalesce(p_referred_name, '')), ''),
    v_new_code,
    25,          -- default credit; overridden by business if needed
    'pending'
  )
  RETURNING id INTO v_referral_id;

  RETURN json_build_object(
    'referral_id',   v_referral_id,
    'referral_code', v_new_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_portal_referral(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_portal_referral(uuid, text, text) TO service_role;
