
CREATE OR REPLACE FUNCTION public.unmerge_customers(
  primary_id UUID,
  secondary_id UUID,
  snapshot JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_org   UUID;
  secondary_org UUID;
  bookings_back        INT := 0;
  recurring_back       INT := 0;
  quotes_back          INT := 0;
  locations_back       INT := 0;
  referrals_back       INT := 0;
  loyalty_back         INT := 0;
  notes_back           INT := 0;
  pf JSONB := COALESCE(snapshot->'primary_fields', '{}'::jsonb);
BEGIN
  IF primary_id = secondary_id THEN
    RAISE EXCEPTION 'unmerge_customers: primary and secondary cannot be the same customer';
  END IF;

  SELECT organization_id INTO primary_org
    FROM public.customers WHERE id = primary_id;
  IF primary_org IS NULL THEN
    RAISE EXCEPTION 'unmerge_customers: primary customer not found';
  END IF;

  SELECT organization_id INTO secondary_org
    FROM public.customers WHERE id = secondary_id AND merged_into = primary_id;
  IF secondary_org IS NULL THEN
    RAISE EXCEPTION 'unmerge_customers: secondary customer not found or not merged into primary';
  END IF;

  IF primary_org <> secondary_org THEN
    RAISE EXCEPTION 'unmerge_customers: customers belong to different organizations';
  END IF;

  IF NOT public.is_org_admin(primary_org) THEN
    RAISE EXCEPTION 'unmerge_customers: caller is not an org admin';
  END IF;

  -- Restore the soft-deleted secondary
  UPDATE public.customers
  SET merged_into = NULL, updated_at = now()
  WHERE id = secondary_id;

  -- Move records back using ID snapshots
  IF to_regclass('public.bookings') IS NOT NULL AND snapshot ? 'booking_ids' THEN
    UPDATE public.bookings SET customer_id = secondary_id
    WHERE customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'booking_ids'));
    GET DIAGNOSTICS bookings_back = ROW_COUNT;
  END IF;

  IF to_regclass('public.recurring_bookings') IS NOT NULL AND snapshot ? 'recurring_ids' THEN
    UPDATE public.recurring_bookings SET customer_id = secondary_id
    WHERE customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'recurring_ids'));
    GET DIAGNOSTICS recurring_back = ROW_COUNT;
  END IF;

  IF to_regclass('public.quotes') IS NOT NULL AND snapshot ? 'quote_ids' THEN
    UPDATE public.quotes SET customer_id = secondary_id
    WHERE customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'quote_ids'));
    GET DIAGNOSTICS quotes_back = ROW_COUNT;
  END IF;

  IF to_regclass('public.locations') IS NOT NULL AND snapshot ? 'location_ids' THEN
    UPDATE public.locations SET customer_id = secondary_id
    WHERE customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'location_ids'));
    GET DIAGNOSTICS locations_back = ROW_COUNT;
  END IF;

  IF to_regclass('public.property_notes') IS NOT NULL AND snapshot ? 'property_note_ids' THEN
    UPDATE public.property_notes SET customer_id = secondary_id
    WHERE customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'property_note_ids'));
    GET DIAGNOSTICS notes_back = ROW_COUNT;
  END IF;

  IF to_regclass('public.referrals') IS NOT NULL AND snapshot ? 'referrer_ids' THEN
    UPDATE public.referrals SET referrer_customer_id = secondary_id
    WHERE referrer_customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'referrer_ids'));
    GET DIAGNOSTICS referrals_back = ROW_COUNT;
  END IF;

  IF to_regclass('public.referrals') IS NOT NULL AND snapshot ? 'referred_ids' THEN
    UPDATE public.referrals SET referred_customer_id = secondary_id
    WHERE referred_customer_id = primary_id
      AND id::text IN (SELECT jsonb_array_elements_text(snapshot->'referred_ids'));
  END IF;

  -- Restore overwritten primary fields from snapshot (only fields explicitly captured)
  UPDATE public.customers
  SET
    email      = COALESCE(pf->>'email',      email),
    phone      = COALESCE(pf->>'phone',      phone),
    address    = COALESCE(pf->>'address',    address),
    city       = COALESCE(pf->>'city',       city),
    state      = COALESCE(pf->>'state',      state),
    zip_code   = COALESCE(pf->>'zip_code',   zip_code),
    notes      = COALESCE(pf->>'notes',      notes),
    updated_at = now()
  WHERE id = primary_id;

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', primary_id,
    'secondary_id', secondary_id,
    'bookings_restored', bookings_back,
    'recurring_restored', recurring_back,
    'quotes_restored', quotes_back,
    'locations_restored', locations_back,
    'referrals_restored', referrals_back,
    'loyalty_restored', loyalty_back,
    'notes_restored', notes_back
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unmerge_customers(UUID, UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unmerge_customers(UUID, UUID, JSONB) TO authenticated;
