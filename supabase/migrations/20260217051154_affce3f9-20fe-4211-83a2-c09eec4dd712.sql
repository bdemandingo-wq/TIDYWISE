-- Fix invoices_lead_id_fkey to cascade on delete
ALTER TABLE public.invoices DROP CONSTRAINT invoices_lead_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

-- Fix quotes_lead_id_fkey to cascade on delete
ALTER TABLE public.quotes DROP CONSTRAINT quotes_lead_id_fkey;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;