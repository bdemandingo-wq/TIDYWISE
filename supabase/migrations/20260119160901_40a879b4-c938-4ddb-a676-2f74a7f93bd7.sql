-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number SERIAL NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  customer_id UUID REFERENCES public.customers(id),
  lead_id UUID REFERENCES public.leads(id),
  
  -- Financial fields
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_percent NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  
  -- Stripe integration
  stripe_invoice_id TEXT,
  stripe_invoice_url TEXT,
  stripe_payment_intent_id TEXT,
  
  -- Dates
  due_date DATE,
  paid_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Additional info
  notes TEXT,
  address TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoice_items table for line items
CREATE TABLE public.invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invoices
CREATE POLICY "Users can view invoices in their organization" 
ON public.invoices 
FOR SELECT 
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can create invoices in their organization" 
ON public.invoices 
FOR INSERT 
WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Users can update invoices in their organization" 
ON public.invoices 
FOR UPDATE 
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can delete invoices in their organization" 
ON public.invoices 
FOR DELETE 
USING (public.is_org_member(organization_id));

-- RLS Policies for invoice_items (based on parent invoice)
CREATE POLICY "Users can view invoice items for their invoices" 
ON public.invoice_items 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE invoices.id = invoice_items.invoice_id 
    AND public.is_org_member(invoices.organization_id)
  )
);

CREATE POLICY "Users can create invoice items for their invoices" 
ON public.invoice_items 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE invoices.id = invoice_items.invoice_id 
    AND public.is_org_member(invoices.organization_id)
  )
);

CREATE POLICY "Users can update invoice items for their invoices" 
ON public.invoice_items 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE invoices.id = invoice_items.invoice_id 
    AND public.is_org_member(invoices.organization_id)
  )
);

CREATE POLICY "Users can delete invoice items for their invoices" 
ON public.invoice_items 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE invoices.id = invoice_items.invoice_id 
    AND public.is_org_member(invoices.organization_id)
  )
);

-- Create indexes for performance
CREATE INDEX idx_invoices_organization_id ON public.invoices(organization_id);
CREATE INDEX idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- Add trigger for updated_at
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();