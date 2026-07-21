-- Atomic, race-safe coupon redemption counter.
CREATE OR REPLACE FUNCTION public.increment_coupon_use(p_discount_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_updated BOOLEAN;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.discounts
  WHERE id = p_discount_id;

  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RETURN false;
  END IF;

  UPDATE public.discounts
  SET current_uses = current_uses + 1
  WHERE id = p_discount_id
    AND is_active = true
    AND (valid_until IS NULL OR valid_until > now())
    AND (max_uses IS NULL OR current_uses < max_uses)
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_use(UUID) TO authenticated;