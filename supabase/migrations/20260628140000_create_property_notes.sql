CREATE TABLE public.property_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  notes TEXT,
  access_instructions TEXT,
  gate_code TEXT,
  alarm_code TEXT,
  has_pets BOOLEAN NOT NULL DEFAULT false,
  pet_notes TEXT,
  parking_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id)
);

ALTER TABLE public.property_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage property notes"
  ON public.property_notes
  FOR ALL
  TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE INDEX idx_property_notes_org ON public.property_notes(organization_id);
CREATE INDEX idx_property_notes_customer ON public.property_notes(customer_id);
