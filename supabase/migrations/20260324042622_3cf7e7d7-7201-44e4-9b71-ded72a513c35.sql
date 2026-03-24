
-- Custom automations table
CREATE TABLE public.custom_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- new_lead, booking_started, booking_confirmed, service_complete, payment_received, no_response, recurring_due, str_turnover
  tag_filter TEXT, -- new_lead, booked, recurring, str, vip, inactive, commercial
  is_active BOOLEAN DEFAULT true,
  overrides_default TEXT, -- if set, the default automation_type that this custom one overrides
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage custom automations"
  ON public.custom_automations
  FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Custom automation steps (multi-step sequence)
CREATE TABLE public.custom_automation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.custom_automations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 1,
  delay_value INTEGER NOT NULL DEFAULT 0, -- number
  delay_unit TEXT NOT NULL DEFAULT 'min', -- min, hr, days
  condition TEXT NOT NULL DEFAULT 'always', -- always, only_if_no_reply
  message_body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_automation_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Steps follow parent automation access"
  ON public.custom_automation_steps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_automations ca
      WHERE ca.id = automation_id
      AND public.is_org_member(ca.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.custom_automations ca
      WHERE ca.id = automation_id
      AND public.is_org_member(ca.organization_id)
    )
  );

-- Custom automation execution log
CREATE TABLE public.custom_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.custom_automations(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.custom_automation_steps(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, paused, failed
  sent_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  error TEXT,
  paused_reason TEXT, -- e.g. 'client_replied'
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view automation logs"
  ON public.custom_automation_logs
  FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE INDEX idx_custom_automations_org ON public.custom_automations(organization_id);
CREATE INDEX idx_custom_automation_steps_automation ON public.custom_automation_steps(automation_id);
CREATE INDEX idx_custom_automation_logs_org ON public.custom_automation_logs(organization_id);
CREATE INDEX idx_custom_automation_logs_automation ON public.custom_automation_logs(automation_id);
