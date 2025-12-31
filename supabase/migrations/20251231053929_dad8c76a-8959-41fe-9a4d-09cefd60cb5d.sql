-- Service Pricing table - stores independent pricing per service per organization
CREATE TABLE public.service_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  sqft_prices JSONB DEFAULT '[]'::jsonb, -- Array of prices indexed by sqft range
  bedroom_pricing JSONB DEFAULT '[]'::jsonb, -- Array of {bedrooms, bathrooms, basePrice}
  extras JSONB DEFAULT '[]'::jsonb, -- Array of {id, name, price, note, icon}
  pet_options JSONB DEFAULT '[]'::jsonb, -- Array of {id, label, price}
  home_condition_options JSONB DEFAULT '[]'::jsonb, -- Array of {id, label, price}
  minimum_price NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, service_id)
);

-- Organization Settings table - global settings per organization
CREATE TABLE public.organization_pricing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  show_sqft_on_booking BOOLEAN DEFAULT true,
  sales_tax_percent NUMERIC DEFAULT 0,
  demo_mode_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Discounts/Coupons table
CREATE TABLE public.discounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC NOT NULL,
  min_order_amount NUMERIC DEFAULT 0,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  is_test BOOLEAN DEFAULT false, -- For demo mode
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- Add is_test column to bookings for demo mode
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Add discount tracking to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES public.discounts(id);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS subtotal NUMERIC;

-- Enable RLS
ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_pricing
CREATE POLICY "Users can view their org service pricing"
  ON public.service_pricing FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Admins can manage their org service pricing"
  ON public.service_pricing FOR ALL
  USING (public.is_org_admin(organization_id));

-- RLS Policies for organization_pricing_settings
CREATE POLICY "Users can view their org pricing settings"
  ON public.organization_pricing_settings FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Admins can manage their org pricing settings"
  ON public.organization_pricing_settings FOR ALL
  USING (public.is_org_admin(organization_id));

-- RLS Policies for discounts
CREATE POLICY "Users can view their org discounts"
  ON public.discounts FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Admins can manage their org discounts"
  ON public.discounts FOR ALL
  USING (public.is_org_admin(organization_id));

-- Update triggers
CREATE TRIGGER update_service_pricing_updated_at
  BEFORE UPDATE ON public.service_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_pricing_settings_updated_at
  BEFORE UPDATE ON public.organization_pricing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_discounts_updated_at
  BEFORE UPDATE ON public.discounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();