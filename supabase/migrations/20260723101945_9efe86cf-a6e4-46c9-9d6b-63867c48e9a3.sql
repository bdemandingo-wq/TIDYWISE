
-- 1) Add email lock column
ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS email_lock text;

-- Normalise: store lowercase trimmed
CREATE OR REPLACE FUNCTION public.normalize_access_code_email_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email_lock IS NOT NULL THEN
    NEW.email_lock := lower(trim(NEW.email_lock));
    IF NEW.email_lock = '' THEN NEW.email_lock := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_access_codes_normalize_email ON public.access_codes;
CREATE TRIGGER trg_access_codes_normalize_email
  BEFORE INSERT OR UPDATE ON public.access_codes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_access_code_email_lock();

-- 2) Redemption log
CREATE TABLE IF NOT EXISTS public.access_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id uuid NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.access_code_redemptions TO authenticated;
GRANT ALL ON public.access_code_redemptions TO service_role;

ALTER TABLE public.access_code_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admin can view redemptions" ON public.access_code_redemptions;
CREATE POLICY "Platform admin can view redemptions"
  ON public.access_code_redemptions FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_access_code_redemptions_code
  ON public.access_code_redemptions(access_code_id, redeemed_at DESC);

-- 3) Update redeem_access_code to enforce email lock + record redemption
CREATE OR REPLACE FUNCTION public.redeem_access_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_code public.access_codes%ROWTYPE;
  v_org uuid;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user;

  SELECT organization_id INTO v_org
  FROM public.org_memberships
  WHERE user_id = v_user AND role IN ('owner','admin')
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only workspace owners can redeem access codes';
  END IF;

  SELECT * INTO v_code FROM public.access_codes
  WHERE lower(code) = lower(trim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;
  IF NOT v_code.active THEN
    RAISE EXCEPTION 'This code is no longer active';
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RAISE EXCEPTION 'This code has expired';
  END IF;
  IF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
    RAISE EXCEPTION 'This code has no uses remaining';
  END IF;
  IF v_code.email_lock IS NOT NULL AND v_code.email_lock <> COALESCE(v_email, '') THEN
    RAISE EXCEPTION 'This code is reserved for a different account';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.comped_access
    WHERE organization_id = v_org
      AND access_code_id = v_code.id
      AND revoked_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'This code has already been redeemed for your organization';
  END IF;

  v_expires := now() + make_interval(days => v_code.duration_days);

  INSERT INTO public.comped_access (organization_id, expires_at, granted_by, reason, access_code_id)
  VALUES (v_org, v_expires, v_user, COALESCE(v_code.reason, 'Redeemed code: ' || v_code.code), v_code.id);

  UPDATE public.access_codes SET uses = uses + 1 WHERE id = v_code.id;

  INSERT INTO public.access_code_redemptions (access_code_id, user_id, organization_id, email)
  VALUES (v_code.id, v_user, v_org, v_email);

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org,
    'expires_at', v_expires,
    'duration_days', v_code.duration_days
  );
END;
$$;
