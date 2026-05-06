-- Duplicate customer detection + merge.

DO $$ BEGIN
  ALTER TABLE public.customers
    ADD COLUMN merged_into UUID REFERENCES public.customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_active
  ON public.customers(organization_id)
  WHERE merged_into IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_merged_into
  ON public.customers(merged_into)
  WHERE merged_into IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.customer_duplicate_ignored (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_a_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_b_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  ignored_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ignored_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT customer_duplicate_ignored_no_self_pair CHECK (customer_a_id <> customer_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_duplicate_ignored_pair
  ON public.customer_duplicate_ignored(
    organization_id,
    LEAST(customer_a_id, customer_b_id),
    GREATEST(customer_a_id, customer_b_id)
  );

ALTER TABLE public.customer_duplicate_ignored ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org members read ignored pairs"
    ON public.customer_duplicate_ignored FOR SELECT
    USING (public.is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Org admins insert ignored pairs"
    ON public.customer_duplicate_ignored FOR INSERT
    WITH CHECK (public.is_org_admin(organization_id) AND ignored_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.merge_customers(
  primary_id   UUID,
  secondary_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_org   UUID;
  secondary_org UUID;
  caller_id     UUID := auth.uid();
  bookings_moved        INT := 0;
  recurring_moved       INT := 0;
  quotes_moved          INT := 0;
  locations_moved       INT := 0;
  referrals_moved_a     INT := 0;
  referrals_moved_b     INT := 0;
  loyalty_moved         INT := 0;
  notes_moved           INT := 0;
BEGIN
  IF primary_id = secondary_id THEN
    RAISE EXCEPTION 'merge_customers: primary and secondary cannot be the same customer';
  END IF;

  SELECT organization_id INTO primary_org
    FROM public.customers WHERE id = primary_id AND merged_into IS NULL;
  IF primary_org IS NULL THEN
    RAISE EXCEPTION 'merge_customers: primary customer not found or already merged';
  END IF;

  SELECT organization_id INTO secondary_org
    FROM public.customers WHERE id = secondary_id AND merged_into IS NULL;
  IF secondary_org IS NULL THEN
    RAISE EXCEPTION 'merge_customers: secondary customer not found or already merged';
  END IF;

  IF primary_org <> secondary_org THEN
    RAISE EXCEPTION 'merge_customers: customers belong to different organizations';
  END IF;

  IF NOT public.is_org_admin(primary_org) THEN
    RAISE EXCEPTION 'merge_customers: caller is not an org admin';
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    UPDATE public.bookings SET customer_id = primary_id WHERE customer_id = secondary_id;
    GET DIAGNOSTICS bookings_moved = ROW_COUNT;
  END IF;

  IF to_regclass('public.recurring_bookings') IS NOT NULL THEN
    UPDATE public.recurring_bookings SET customer_id = primary_id WHERE customer_id = secondary_id;
    GET DIAGNOSTICS recurring_moved = ROW_COUNT;
  END IF;

  IF to_regclass('public.quotes') IS NOT NULL THEN
    UPDATE public.quotes SET customer_id = primary_id WHERE customer_id = secondary_id;
    GET DIAGNOSTICS quotes_moved = ROW_COUNT;
  END IF;

  IF to_regclass('public.locations') IS NOT NULL THEN
    UPDATE public.locations SET customer_id = primary_id WHERE customer_id = secondary_id;
    GET DIAGNOSTICS locations_moved = ROW_COUNT;
  END IF;

  IF to_regclass('public.referrals') IS NOT NULL THEN
    UPDATE public.referrals SET referrer_customer_id = primary_id WHERE referrer_customer_id = secondary_id;
    GET DIAGNOSTICS referrals_moved_a = ROW_COUNT;
    UPDATE public.referrals SET referred_customer_id = primary_id WHERE referred_customer_id = secondary_id;
    GET DIAGNOSTICS referrals_moved_b = ROW_COUNT;
  END IF;

  IF to_regclass('public.customer_loyalty') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.customer_loyalty WHERE customer_id = primary_id) THEN
      DELETE FROM public.customer_loyalty WHERE customer_id = secondary_id;
    ELSE
      UPDATE public.customer_loyalty SET customer_id = primary_id WHERE customer_id = secondary_id;
    END IF;
    GET DIAGNOSTICS loyalty_moved = ROW_COUNT;
  END IF;

  IF to_regclass('public.property_notes') IS NOT NULL THEN
    UPDATE public.property_notes SET customer_id = primary_id WHERE customer_id = secondary_id;
    GET DIAGNOSTICS notes_moved = ROW_COUNT;
  END IF;

  UPDATE public.customers p
  SET
    email      = COALESCE(NULLIF(p.email,''),      s.email),
    phone      = COALESCE(NULLIF(p.phone,''),      s.phone),
    address    = COALESCE(NULLIF(p.address,''),    s.address),
    city       = COALESCE(NULLIF(p.city,''),       s.city),
    state      = COALESCE(NULLIF(p.state,''),      s.state),
    zip_code   = COALESCE(NULLIF(p.zip_code,''),   s.zip_code),
    notes      = CASE
                   WHEN p.notes IS NULL OR p.notes = '' THEN s.notes
                   WHEN s.notes IS NULL OR s.notes = '' THEN p.notes
                   ELSE p.notes || E'\n\n--- Merged from duplicate ---\n' || s.notes
                 END,
    updated_at = now()
  FROM public.customers s
  WHERE p.id = primary_id AND s.id = secondary_id;

  UPDATE public.customers
  SET merged_into = primary_id, updated_at = now()
  WHERE id = secondary_id;

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', primary_id,
    'secondary_id', secondary_id,
    'caller_id', caller_id,
    'bookings_moved', bookings_moved,
    'recurring_moved', recurring_moved,
    'quotes_moved', quotes_moved,
    'locations_moved', locations_moved,
    'referrals_moved', referrals_moved_a + referrals_moved_b,
    'loyalty_moved', loyalty_moved,
    'notes_moved', notes_moved
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_customers(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.merge_customers(UUID, UUID) TO authenticated;