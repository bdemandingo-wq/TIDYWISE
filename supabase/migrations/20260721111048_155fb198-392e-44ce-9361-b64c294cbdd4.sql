
-- ============================================================
-- Backfill: working_hours.organization_id
-- ============================================================
ALTER TABLE public.working_hours
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.working_hours wh
SET organization_id = s.organization_id
FROM public.staff s
WHERE wh.staff_id = s.id
  AND wh.organization_id IS NULL;

-- Only enforce NOT NULL if all rows populated
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.working_hours WHERE organization_id IS NULL) THEN
    ALTER TABLE public.working_hours ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_working_hours_organization_id
  ON public.working_hours(organization_id);

DROP POLICY IF EXISTS "Org members can view working hours"   ON public.working_hours;
DROP POLICY IF EXISTS "Staff can manage own working hours"   ON public.working_hours;
DROP POLICY IF EXISTS "Org admins can manage working hours"  ON public.working_hours;
DROP POLICY IF EXISTS "Admins can manage working hours"      ON public.working_hours;
DROP POLICY IF EXISTS "Anyone can view working hours"        ON public.working_hours;
DROP POLICY IF EXISTS "Public can view working hours"        ON public.working_hours;

CREATE POLICY "Org members can view working hours"
ON public.working_hours FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage own working hours"
ON public.working_hours FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = working_hours.staff_id AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = working_hours.staff_id AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Org admins can manage working hours"
ON public.working_hours FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- ============================================================
-- Backfill: customers.referral_code
-- ============================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

UPDATE public.customers c
SET referral_code = r.referral_code
FROM (
  SELECT DISTINCT ON (referrer_customer_id)
    referrer_customer_id, referral_code
  FROM public.referrals
  ORDER BY referrer_customer_id, created_at DESC
) r
WHERE c.id = r.referrer_customer_id
  AND c.referral_code IS NULL;

UPDATE public.customers
SET referral_code = upper(left(replace(id::text, '-', ''), 8))
WHERE referral_code IS NULL;

UPDATE public.customers
SET referral_code = upper(left(replace(id::text, '-', ''), 10))
WHERE referral_code IN (
  SELECT referral_code FROM public.customers GROUP BY referral_code HAVING count(*) > 1
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE referral_code IS NULL) THEN
    ALTER TABLE public.customers ALTER COLUMN referral_code SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code
  ON public.customers(referral_code);

CREATE OR REPLACE FUNCTION public.set_customer_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(left(replace(NEW.id::text, '-', ''), 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_referral_code ON public.customers;
CREATE TRIGGER trg_set_customer_referral_code
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_referral_code();
