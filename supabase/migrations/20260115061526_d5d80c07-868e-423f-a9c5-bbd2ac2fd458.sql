-- Add customer status field for Lead/Active/Inactive segmentation
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS customer_status text NOT NULL DEFAULT 'lead' 
CHECK (customer_status IN ('lead', 'active', 'inactive'));

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(customer_status);

-- Add a comment explaining the field
COMMENT ON COLUMN public.customers.customer_status IS 'Customer lifecycle status: lead (no bookings), active (has bookings), inactive (manually set)';

-- Update existing customers based on booking history
-- Customers with completed bookings become 'active', others stay 'lead'
UPDATE public.customers c
SET customer_status = 'active'
WHERE EXISTS (
  SELECT 1 FROM public.bookings b 
  WHERE b.customer_id = c.id 
  AND b.status = 'completed'
);