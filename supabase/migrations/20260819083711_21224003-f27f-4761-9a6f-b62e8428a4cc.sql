ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.set_leads_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_leads_updated_by_trigger ON public.leads;
CREATE TRIGGER set_leads_updated_by_trigger
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_leads_updated_by();