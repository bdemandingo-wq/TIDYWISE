-- Add tax classification and base wage to staff table
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS tax_classification text DEFAULT 'w2' CHECK (tax_classification IN ('w2', '1099')),
ADD COLUMN IF NOT EXISTS base_wage numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tax_document_url text DEFAULT NULL;

-- Create storage bucket for tax documents (admin-only access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-documents', 'tax-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Only admins can manage tax documents
CREATE POLICY "Admins can manage tax documents"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'tax-documents' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'tax-documents' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);