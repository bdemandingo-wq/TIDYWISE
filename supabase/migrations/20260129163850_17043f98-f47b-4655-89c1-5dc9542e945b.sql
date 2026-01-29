-- Additional charges table for on-site add-on services
CREATE TABLE public.additional_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  charge_name VARCHAR(255) NOT NULL,
  charge_amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Add home address columns to staff for distance calculations
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS home_latitude DECIMAL(10, 8);
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS home_longitude DECIMAL(11, 8);

-- Enable RLS on additional_charges
ALTER TABLE public.additional_charges ENABLE ROW LEVEL SECURITY;

-- RLS policies for additional_charges
CREATE POLICY "Users can view additional charges for their org"
  ON public.additional_charges FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Users can create additional charges for their org"
  ON public.additional_charges FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Users can update additional charges for their org"
  ON public.additional_charges FOR UPDATE
  USING (public.is_org_member(organization_id));

CREATE POLICY "Users can delete additional charges for their org"
  ON public.additional_charges FOR DELETE
  USING (public.is_org_member(organization_id));

-- Create index for faster lookups
CREATE INDEX idx_additional_charges_booking_id ON public.additional_charges(booking_id);
CREATE INDEX idx_additional_charges_organization_id ON public.additional_charges(organization_id);