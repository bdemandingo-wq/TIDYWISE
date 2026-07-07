
CREATE OR REPLACE FUNCTION public.credit_ai_purchase(_org_id uuid, _amount integer, _stripe_session_id text, _reason text DEFAULT 'stripe_purchase'::text)
 RETURNS TABLE(already_processed boolean, new_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rowcount INTEGER;
  v_balance INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive, got %', _amount;
  END IF;

  INSERT INTO public.ai_credit_processed_sessions (stripe_session_id, organization_id, credits)
  VALUES (_stripe_session_id, _org_id, _amount)
  ON CONFLICT (stripe_session_id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount = 0 THEN
    SELECT balance INTO v_balance FROM public.ai_credit_ledger WHERE organization_id = _org_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  INSERT INTO public.ai_credit_ledger (organization_id, balance)
  VALUES (_org_id, _amount)
  ON CONFLICT (organization_id)
  DO UPDATE SET balance = public.ai_credit_ledger.balance + _amount,
                updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO public.ai_credit_ledger_entries (organization_id, delta, reason, stripe_session_id)
  VALUES (_org_id, _amount, _reason, _stripe_session_id);

  RETURN QUERY SELECT FALSE, v_balance;
END;
$function$;

-- Backfill the paid checkout session that failed earlier.
SELECT public.credit_ai_purchase(
  '0f329006-ac99-46b1-83d1-632c6a1bb355'::uuid,
  500,
  'cs_live_a1vPrtzqN4V8gXLeKJwCMQIkLxxPZyrD2MZLHyzlDwji7G3R7oYF5mNudj',
  'stripe_purchase'
);
