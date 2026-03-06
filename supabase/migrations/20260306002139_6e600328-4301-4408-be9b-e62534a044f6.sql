
CREATE TABLE public.payroll_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payroll_week_start_day TEXT NOT NULL DEFAULT 'monday',
  processing_fee_mode TEXT NOT NULL DEFAULT 'percent',
  processing_fee_percent NUMERIC NOT NULL DEFAULT 2.9,
  vendor_cost_mode TEXT NOT NULL DEFAULT 'none',
  vendor_cost_flat NUMERIC DEFAULT 0,
  vendor_cost_percent NUMERIC DEFAULT 0,
  include_tips_in_pay_base BOOLEAN NOT NULL DEFAULT false,
  include_taxes_in_pay_base BOOLEAN NOT NULL DEFAULT false,
  labor_percent_warning_threshold NUMERIC NOT NULL DEFAULT 60,
  margin_percent_good_threshold NUMERIC NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view payroll settings"
  ON public.payroll_settings
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org admins can manage payroll settings"
  ON public.payroll_settings
  FOR ALL
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));
