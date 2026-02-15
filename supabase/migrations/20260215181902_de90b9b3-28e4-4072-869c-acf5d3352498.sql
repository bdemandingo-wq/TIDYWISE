-- Add customer_id column to locations table so addresses can be linked to customers
ALTER TABLE public.locations ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Create index for faster lookups
CREATE INDEX idx_locations_customer_id ON public.locations(customer_id);

-- Add apt_suite column if missing
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS apt_suite TEXT;