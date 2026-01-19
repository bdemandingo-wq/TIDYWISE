-- Add missing accept_cash column to organization_invoice_settings
ALTER TABLE public.organization_invoice_settings 
ADD COLUMN IF NOT EXISTS accept_cash boolean DEFAULT false;