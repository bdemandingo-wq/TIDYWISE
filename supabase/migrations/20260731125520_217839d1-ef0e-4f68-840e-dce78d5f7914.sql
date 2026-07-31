CREATE OR REPLACE FUNCTION public.merge_customers(primary_id uuid, secondary_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  portal_moved          INT := 0;
  portal_deactivated    INT := 0;
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

  IF to_regclass('public.client_portal_users') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.client_portal_users
               WHERE customer_id = secondary_id) THEN
      IF EXISTS (SELECT 1 FROM public.client_portal_users
                 WHERE customer_id = primary_id) THEN
        -- Both have a login. Keep the primary's and disable the duplicate
        -- rather than deleting it, so the change is reversible and auditable.
        UPDATE public.client_portal_users
        SET is_active = false, updated_at = now()
        WHERE customer_id = secondary_id;
        GET DIAGNOSTICS portal_deactivated = ROW_COUNT;
      ELSE
        -- Only the secondary has a login: it IS this customer's login, so move
        -- it to the surviving record.
        UPDATE public.client_portal_users
        SET customer_id = primary_id, updated_at = now()
        WHERE customer_id = secondary_id;
        GET DIAGNOSTICS portal_moved = ROW_COUNT;
      END IF;
    END IF;
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
    'notes_moved', notes_moved,
    'portal_moved', portal_moved,
    'portal_deactivated', portal_deactivated
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.unmerge_customers(primary_id uuid, secondary_id uuid, snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  portal_back          INT := 0;
  portal_reactivated   INT := 0;
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

  -- Portal login restore (no-ops when the snapshot predates this change)
  IF to_regclass('public.client_portal_users') IS NOT NULL THEN
    IF snapshot ? 'portal_user_moved_id' AND (snapshot->>'portal_user_moved_id') IS NOT NULL THEN
      UPDATE public.client_portal_users
      SET customer_id = secondary_id, updated_at = now()
      WHERE id = (snapshot->>'portal_user_moved_id')::uuid;
      GET DIAGNOSTICS portal_back = ROW_COUNT;
    END IF;

    IF snapshot ? 'portal_user_deactivated_id' AND (snapshot->>'portal_user_deactivated_id') IS NOT NULL THEN
      UPDATE public.client_portal_users
      SET is_active = true, updated_at = now()
      WHERE id = (snapshot->>'portal_user_deactivated_id')::uuid;
      GET DIAGNOSTICS portal_reactivated = ROW_COUNT;
    END IF;
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
    'notes_restored', notes_back,
    'portal_restored', portal_back,
    'portal_reactivated', portal_reactivated
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unmerge_customers(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_customers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmerge_customers(uuid, uuid, jsonb) TO authenticated;