-- Atomic "claim one of the 50 spots" function.
--
-- Doing a SELECT-then-UPDATE in the webhook had a TOCTOU race:
-- between reading sold_spots and writing the incremented value, two
-- concurrent webhook invocations could both read the same value and
-- both write the same new value, oversold or not. This RPC does the
-- increment in one statement; the CHECK(sold_spots <= total_spots)
-- constraint on the table is the last line of defense, raising
-- check_violation if a 51st claim attempts to land.

CREATE OR REPLACE FUNCTION public.claim_lifetime_spot()
RETURNS TABLE(sold_spots integer, total_spots integer, sold_out boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sold integer;
  v_total integer;
BEGIN
  UPDATE public.lifetime_offer_state
  SET
    sold_spots = lifetime_offer_state.sold_spots + 1,
    sold_out_at = CASE
      WHEN lifetime_offer_state.sold_spots + 1 >= lifetime_offer_state.total_spots
        AND lifetime_offer_state.sold_out_at IS NULL
        THEN now()
      ELSE lifetime_offer_state.sold_out_at
    END
  WHERE id = 1
  RETURNING lifetime_offer_state.sold_spots, lifetime_offer_state.total_spots
  INTO v_sold, v_total;

  RETURN QUERY SELECT v_sold, v_total, (v_sold >= v_total);
END;
$$;

-- Only the service role (the webhook) calls this. Public clients
-- read the counter directly via SELECT on lifetime_offer_state.
REVOKE ALL ON FUNCTION public.claim_lifetime_spot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lifetime_spot() TO service_role;
