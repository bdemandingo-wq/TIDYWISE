-- Fix migration: Postgres doesn't support CREATE POLICY IF NOT EXISTS.
-- Also ensure customer_portal_invites has updated_at for update_updated_at_column trigger.

CREATE TABLE IF NOT EXISTS public.customer_portal_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz NULL,
  accepted_by_user_id uuid NULL,
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add updated_at if table already existed from partial runs (safe)
ALTER TABLE public.customer_portal_invites
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_customer_portal_invites_org ON public.customer_portal_invites (organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_portal_invites_customer ON public.customer_portal_invites (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_portal_invites_token_hash ON public.customer_portal_invites (token_hash);

ALTER TABLE public.customer_portal_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_portal_invites' AND policyname='Org admins can view portal invites'
  ) THEN
    EXECUTE 'CREATE POLICY "Org admins can view portal invites" ON public.customer_portal_invites FOR SELECT USING (public.is_org_admin(organization_id));';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_portal_invites' AND policyname='Org admins can create portal invites'
  ) THEN
    EXECUTE 'CREATE POLICY "Org admins can create portal invites" ON public.customer_portal_invites FOR INSERT WITH CHECK (public.is_org_admin(organization_id));';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_portal_invites' AND policyname='Org admins can update portal invites'
  ) THEN
    EXECUTE 'CREATE POLICY "Org admins can update portal invites" ON public.customer_portal_invites FOR UPDATE USING (public.is_org_admin(organization_id));';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_portal_invites' AND policyname='Org admins can delete portal invites'
  ) THEN
    EXECUTE 'CREATE POLICY "Org admins can delete portal invites" ON public.customer_portal_invites FOR DELETE USING (public.is_org_admin(organization_id));';
  END IF;
END $$;

-- Customer portal read/insert access
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='customers' AND policyname='Customers can view own customer profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Customers can view own customer profile" ON public.customers FOR SELECT USING (user_id = auth.uid());';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='bookings' AND policyname='Customers can view own bookings'
  ) THEN
    EXECUTE 'CREATE POLICY "Customers can view own bookings" ON public.bookings FOR SELECT USING (customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = bookings.customer_id AND c.user_id = auth.uid() AND c.organization_id = bookings.organization_id));';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='bookings' AND policyname='Customers can create draft booking requests'
  ) THEN
    EXECUTE 'CREATE POLICY "Customers can create draft booking requests" ON public.bookings FOR INSERT WITH CHECK (is_draft = true AND status = ''pending'' AND payment_status = ''pending'' AND customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = bookings.customer_id AND c.user_id = auth.uid() AND c.organization_id = bookings.organization_id));';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='customer_loyalty' AND policyname='Customers can view own loyalty'
  ) THEN
    EXECUTE 'CREATE POLICY "Customers can view own loyalty" ON public.customer_loyalty FOR SELECT USING (customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_loyalty.customer_id AND c.user_id = auth.uid()));';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='loyalty_transactions' AND policyname='Customers can view own loyalty transactions'
  ) THEN
    EXECUTE 'CREATE POLICY "Customers can view own loyalty transactions" ON public.loyalty_transactions FOR SELECT USING (customer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = loyalty_transactions.customer_id AND c.user_id = auth.uid()));';
  END IF;
END $$;

-- updated_at trigger
DROP TRIGGER IF EXISTS update_customer_portal_invites_updated_at ON public.customer_portal_invites;
CREATE TRIGGER update_customer_portal_invites_updated_at
BEFORE UPDATE ON public.customer_portal_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
