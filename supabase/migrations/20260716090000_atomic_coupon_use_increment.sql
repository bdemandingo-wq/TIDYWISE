-- Atomic, race-safe coupon redemption counter.
--
-- Why this exists: the client-side coupon-apply flow in the booking form
-- never persisted a discount onto the booking record at all (total_amount
-- ignored the applied discount entirely), and separately, current_uses was
-- never incremented by any code path — max_uses was completely
-- unenforceable. Fixing forward requires incrementing current_uses at the
-- moment a booking is actually saved with a discount, and doing so with a
-- single atomic UPDATE (not a client read-then-write) so two concurrent
-- bookings using the same near-limit coupon can't both pass the max_uses
-- check before either increments.
--
-- SECURITY DEFINER is required here, not just for atomicity: write access
-- to public.discounts is restricted to org admins ("Admins can manage
-- their org discounts", is_org_admin), but any org member can view and
-- apply a valid discount when creating a booking (is_org_member on the
-- SELECT policy). Without SECURITY DEFINER, a non-admin staff member
-- successfully applying a coupon to a booking would be unable to record
-- the redemption at all. Scoped to org membership below so a caller can
-- only redeem against a coupon in their own organization.
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
    RETURN false; -- discount doesn't exist
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RETURN false; -- caller isn't a member of the org this coupon belongs to
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
