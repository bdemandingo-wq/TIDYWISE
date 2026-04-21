CREATE TABLE public.stripe_reset_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  previous_stripe_account_id text,
  new_stripe_account_id text,
  reason text,
  initiated_by text NOT NULL DEFAULT 'cleaner',
  initiated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_reset_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view reset history"
  ON public.stripe_reset_history FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Staff can view own reset history"
  ON public.stripe_reset_history FOR SELECT
  TO authenticated
  USING (public.is_org_staff(organization_id));

CREATE INDEX idx_stripe_reset_history_staff ON public.stripe_reset_history(staff_id);
CREATE INDEX idx_stripe_reset_history_org ON public.stripe_reset_history(organization_id);