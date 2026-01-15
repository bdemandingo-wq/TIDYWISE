-- Add marketing_status field to customers table for opt-out functionality
ALTER TABLE public.customers 
ADD COLUMN marketing_status TEXT NOT NULL DEFAULT 'active' 
CHECK (marketing_status IN ('active', 'opted_out'));

-- Add index for faster filtering in campaigns
CREATE INDEX idx_customers_marketing_status ON public.customers(organization_id, marketing_status);

-- Add comment
COMMENT ON COLUMN public.customers.marketing_status IS 'Marketing opt-in status: active (can receive campaigns) or opted_out (excluded from all campaigns)';