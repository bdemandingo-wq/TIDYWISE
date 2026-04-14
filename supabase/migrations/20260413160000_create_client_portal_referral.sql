-- ============================================================
-- RPC: create_client_portal_referral
-- Called from the client portal to create a referral invite.
-- SECURITY DEFINER so the anon key can write to the referrals
-- table without needing direct INSERT RLS on that table.
-- ============================================================

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
  -- Resolve portal user → customer + org
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

-- Grant to anon (portal uses the anon key, not an authenticated Supabase user)
GRANT EXECUTE ON FUNCTION public.create_client_portal_referral(UUID, TEXT, TEXT) TO anon, authenticated;
