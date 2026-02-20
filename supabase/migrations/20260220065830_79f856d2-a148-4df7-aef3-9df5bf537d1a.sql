
-- Migration imports: tracks each import session
CREATE TABLE public.migration_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('bookingkoala', 'jobber', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'mapping', 'preview', 'importing', 'completed', 'failed', 'rolled_back')),
  data_type TEXT NOT NULL CHECK (data_type IN ('customers', 'staff', 'bookings', 'services')),
  original_filename TEXT,
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  duplicate_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  field_mapping JSONB DEFAULT '{}',
  import_summary JSONB DEFAULT '{}',
  error_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration import rows: individual parsed rows
CREATE TABLE public.migration_import_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.migration_imports(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}',
  mapped_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'duplicate', 'error', 'imported', 'skipped')),
  duplicate_of UUID,
  validation_errors JSONB DEFAULT '[]',
  created_record_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_migration_imports_org ON public.migration_imports(organization_id);
CREATE INDEX idx_migration_import_rows_import ON public.migration_import_rows(import_id);
CREATE INDEX idx_migration_import_rows_status ON public.migration_import_rows(status);

-- Enable RLS
ALTER TABLE public.migration_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_import_rows ENABLE ROW LEVEL SECURITY;

-- RLS policies for migration_imports
CREATE POLICY "Org admins can view their migration imports"
  ON public.migration_imports FOR SELECT
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can create migration imports"
  ON public.migration_imports FOR INSERT
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update their migration imports"
  ON public.migration_imports FOR UPDATE
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete their migration imports"
  ON public.migration_imports FOR DELETE
  USING (public.is_org_admin(organization_id));

-- RLS policies for migration_import_rows
CREATE POLICY "Org admins can view their migration rows"
  ON public.migration_import_rows FOR SELECT
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can create migration rows"
  ON public.migration_import_rows FOR INSERT
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update their migration rows"
  ON public.migration_import_rows FOR UPDATE
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete their migration rows"
  ON public.migration_import_rows FOR DELETE
  USING (public.is_org_admin(organization_id));

-- Updated_at trigger
CREATE TRIGGER update_migration_imports_updated_at
  BEFORE UPDATE ON public.migration_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
