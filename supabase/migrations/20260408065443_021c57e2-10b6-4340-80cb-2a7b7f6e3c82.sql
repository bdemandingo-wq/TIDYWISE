
-- Estimates table
CREATE TABLE public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  
  -- Status: draft, quote_sent, converted, declined
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- Client Info
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  client_address TEXT,
  client_city TEXT,
  client_state TEXT,
  client_zip TEXT,
  property_type TEXT, -- house, condo, apartment, commercial
  customer_id UUID REFERENCES public.customers(id),
  
  -- Property Details
  square_footage TEXT,
  bedrooms TEXT,
  bathrooms TEXT,
  floors TEXT,
  has_pets BOOLEAN DEFAULT false,
  room_notes JSONB DEFAULT '[]'::jsonb, -- [{room: "Living Room", notes: "..."}]
  
  -- Services & Extras
  selected_services JSONB DEFAULT '[]'::jsonb, -- [{id, name, price}]
  selected_extras JSONB DEFAULT '[]'::jsonb, -- [{id, name, price}]
  custom_line_items JSONB DEFAULT '[]'::jsonb, -- [{name, price}]
  
  -- Photos
  photos JSONB DEFAULT '[]'::jsonb, -- [{url, caption}]
  
  -- Totals
  estimated_total NUMERIC DEFAULT 0,
  
  -- Notes
  notes TEXT,
  
  -- Quote
  quote_token TEXT UNIQUE,
  quote_sent_at TIMESTAMPTZ,
  quote_approved_at TIMESTAMPTZ,
  quote_declined_at TIMESTAMPTZ,
  
  -- Conversion
  converted_booking_id UUID REFERENCES public.bookings(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage estimates"
ON public.estimates
FOR ALL
TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

-- Public read for quote tokens
CREATE POLICY "Public can view by quote token"
ON public.estimates
FOR SELECT
TO anon
USING (quote_token IS NOT NULL AND status = 'quote_sent');

-- Index
CREATE INDEX idx_estimates_org_id ON public.estimates(organization_id);
CREATE INDEX idx_estimates_status ON public.estimates(organization_id, status);
CREATE INDEX idx_estimates_quote_token ON public.estimates(quote_token) WHERE quote_token IS NOT NULL;
