
ALTER TABLE public.payroll_payments 
ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
ADD COLUMN IF NOT EXISTS notes text;
