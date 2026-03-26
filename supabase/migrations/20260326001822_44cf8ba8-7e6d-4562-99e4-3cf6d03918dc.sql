
ALTER TABLE public.staff_documents 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

COMMENT ON COLUMN public.staff_documents.status IS 'pending, approved, or rejected';
