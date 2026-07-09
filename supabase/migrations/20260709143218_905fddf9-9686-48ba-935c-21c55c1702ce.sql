
-- =========================================
-- 1. time_off_requests table
-- =========================================
CREATE TABLE IF NOT EXISTS public.time_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_time_off_org_status ON public.time_off_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_time_off_staff_dates ON public.time_off_requests(staff_id, start_date, end_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_off_requests TO authenticated;
GRANT ALL ON public.time_off_requests TO service_role;

ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff insert own time off"
ON public.time_off_requests FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_id
      AND s.user_id = auth.uid()
      AND s.organization_id = time_off_requests.organization_id
  )
);

CREATE POLICY "Staff or admin view time off"
ON public.time_off_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid())
  OR public.is_org_admin(organization_id, auth.uid())
);

CREATE POLICY "Admin update time off"
ON public.time_off_requests FOR UPDATE TO authenticated
USING (public.is_org_admin(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Staff or admin delete time off"
ON public.time_off_requests FOR DELETE TO authenticated
USING (
  public.is_org_admin(organization_id, auth.uid())
  OR (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.user_id = auth.uid())
  )
);

CREATE TRIGGER time_off_requests_updated_at
BEFORE UPDATE ON public.time_off_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.time_off_requests;
ALTER TABLE public.time_off_requests REPLICA IDENTITY FULL;

-- =========================================
-- 2. Loyalty tier upgrade notifications
-- =========================================
CREATE OR REPLACE FUNCTION public.award_loyalty_points()
RETURNS TRIGGER AS $$
DECLARE
  points_to_award INTEGER;
  existing_loyalty_id UUID;
  current_points INTEGER;
  current_lifetime INTEGER;
  prev_tier TEXT;
  new_tier TEXT;
  tier_rank_prev INT;
  tier_rank_new INT;
  cust_name TEXT;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.customer_id IS NOT NULL THEN
    points_to_award := FLOOR(COALESCE(NEW.total_amount, 0));

    SELECT id, points, lifetime_points, tier
      INTO existing_loyalty_id, current_points, current_lifetime, prev_tier
    FROM public.customer_loyalty
    WHERE customer_id = NEW.customer_id;

    IF existing_loyalty_id IS NULL THEN
      current_points := points_to_award;
      current_lifetime := points_to_award;
      prev_tier := NULL;
      INSERT INTO public.customer_loyalty (customer_id, organization_id, points, lifetime_points, tier)
      VALUES (NEW.customer_id, NEW.organization_id, points_to_award, points_to_award, 'bronze')
      RETURNING id INTO existing_loyalty_id;
      new_tier := 'bronze';
    ELSE
      current_points := COALESCE(current_points, 0) + points_to_award;
      current_lifetime := COALESCE(current_lifetime, 0) + points_to_award;

      IF current_lifetime >= 5000 THEN new_tier := 'platinum';
      ELSIF current_lifetime >= 2000 THEN new_tier := 'gold';
      ELSIF current_lifetime >= 500 THEN new_tier := 'silver';
      ELSE new_tier := 'bronze';
      END IF;

      UPDATE public.customer_loyalty
      SET points = current_points,
          lifetime_points = current_lifetime,
          tier = new_tier,
          updated_at = now()
      WHERE id = existing_loyalty_id;
    END IF;

    INSERT INTO public.loyalty_transactions (customer_id, booking_id, points, transaction_type, description, organization_id)
    VALUES (NEW.customer_id, NEW.id, points_to_award, 'earned', 'Points earned from booking #' || NEW.booking_number, NEW.organization_id);

    -- Tier upgrade notification for admins
    tier_rank_prev := CASE COALESCE(prev_tier,'') WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 ELSE 0 END;
    tier_rank_new  := CASE new_tier WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 WHEN 'platinum' THEN 4 ELSE 0 END;

    IF tier_rank_new > tier_rank_prev AND NEW.organization_id IS NOT NULL THEN
      SELECT COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') INTO cust_name
      FROM public.customers WHERE id = NEW.customer_id;

      INSERT INTO public.admin_system_notifications
        (organization_id, type, title, message, metadata, dedupe_key)
      VALUES (
        NEW.organization_id,
        'loyalty_tier_upgrade',
        'Loyalty tier reached',
        TRIM(COALESCE(cust_name,'A customer')) || ' just reached ' || INITCAP(new_tier) || ' tier',
        jsonb_build_object('customer_id', NEW.customer_id, 'tier', new_tier, 'previous_tier', prev_tier, 'booking_id', NEW.id),
        'loyalty_tier:' || NEW.customer_id::text || ':' || new_tier
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
