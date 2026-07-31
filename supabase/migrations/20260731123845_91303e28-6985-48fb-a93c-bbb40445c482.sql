CREATE OR REPLACE FUNCTION public.award_loyalty_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  points_to_award INTEGER;
  spend_to_award NUMERIC;
  existing_loyalty_id UUID;
  is_new_completion BOOLEAN;
BEGIN
  is_new_completion := (TG_OP = 'INSERT' AND NEW.status = 'completed')
    OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed');

  IF is_new_completion AND NEW.customer_id IS NOT NULL THEN
    -- Idempotency guard: never credit the same booking twice.
    IF EXISTS (
      SELECT 1 FROM public.loyalty_transactions
      WHERE booking_id = NEW.id AND transaction_type = 'earned'
    ) THEN
      RETURN NEW;
    END IF;

    points_to_award := FLOOR(COALESCE(NEW.total_amount, 0));
    spend_to_award := COALESCE(NEW.total_amount, 0);

    SELECT id INTO existing_loyalty_id
    FROM public.customer_loyalty
    WHERE customer_id = NEW.customer_id
      AND organization_id = NEW.organization_id;

    -- Cross-organization guard: the customer must belong to the booking's org.
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = NEW.customer_id
        AND c.organization_id = NEW.organization_id
    ) THEN
      RETURN NEW;
    END IF;

    IF existing_loyalty_id IS NULL THEN
      INSERT INTO public.customer_loyalty (customer_id, organization_id, points, lifetime_points, lifetime_spend)
      VALUES (NEW.customer_id, NEW.organization_id, points_to_award, points_to_award, spend_to_award);
    ELSE
      UPDATE public.customer_loyalty
      SET points = COALESCE(points, 0) + points_to_award,
          lifetime_points = COALESCE(lifetime_points, 0) + points_to_award,
          lifetime_spend = COALESCE(lifetime_spend, 0) + spend_to_award,
          updated_at = now()
      WHERE id = existing_loyalty_id;
    END IF;

    INSERT INTO public.loyalty_transactions (customer_id, booking_id, points, transaction_type, description, organization_id)
    VALUES (NEW.customer_id, NEW.id, points_to_award, 'earned', 'Points earned from booking #' || NEW.booking_number, NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$function$;