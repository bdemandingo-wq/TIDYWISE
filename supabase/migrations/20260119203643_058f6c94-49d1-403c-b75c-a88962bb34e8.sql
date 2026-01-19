-- Add default_billable_hours column to organization_invoice_settings
ALTER TABLE public.organization_invoice_settings 
ADD COLUMN IF NOT EXISTS default_billable_hours numeric DEFAULT 5;