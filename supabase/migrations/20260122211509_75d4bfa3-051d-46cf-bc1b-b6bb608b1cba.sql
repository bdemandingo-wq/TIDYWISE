-- Remove customer portal invite system (table + data)
DO $$
BEGIN
  -- Clear any portal-linked customer accounts (portal used customers.user_id to link auth users)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customers' AND column_name='user_id'
  ) THEN
    UPDATE public.customers
    SET user_id = NULL
    WHERE user_id IS NOT NULL;
  END IF;
END $$;

DROP TABLE IF EXISTS public.customer_portal_invites CASCADE;