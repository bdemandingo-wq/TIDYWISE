DO $$
DECLARE affected INT;
BEGIN
  ALTER TABLE public.organizations DISABLE TRIGGER organizations_block_billing_self_update;
  UPDATE public.organizations SET grandfathered_lifetime = true
    WHERE id = '0f329006-ac99-46b1-83d1-632c6a1bb355';
  GET DIAGNOSTICS affected = ROW_COUNT;
  ALTER TABLE public.organizations ENABLE TRIGGER organizations_block_billing_self_update;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Expected 1 row updated, got %', affected;
  END IF;
END $$;