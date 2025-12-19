-- Add SSN/EIN fields to staff table (stored as last 4 digits only for security)
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS ssn_last4 text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS ein text;

-- Create expenses table for supplies tracking
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL DEFAULT 'supplies',
  description text NOT NULL,
  amount numeric NOT NULL,
  vendor text,
  receipt_url text,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create admin-only policy for expenses
CREATE POLICY "Admins can manage expenses" 
ON public.expenses 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create trigger for updated_at on expenses
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();