-- Add opt-out tracking columns
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_method text,
  ADD COLUMN IF NOT EXISTS opted_out_campaign_id uuid REFERENCES public.automated_campaigns(id) ON DELETE SET NULL;

-- Backfill timestamp for existing opted-out customers (use updated_at as best-effort)
UPDATE public.customers
SET opted_out_at = COALESCE(opted_out_at, updated_at, now()),
    opted_out_method = COALESCE(opted_out_method, 'manual')
WHERE marketing_status = 'opted_out' AND opted_out_at IS NULL;

-- Trigger: keep opted_out_at and method in sync when marketing_status changes
CREATE OR REPLACE FUNCTION public.sync_customer_opt_out_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.marketing_status = 'opted_out' AND (OLD.marketing_status IS DISTINCT FROM 'opted_out') THEN
    NEW.opted_out_at := COALESCE(NEW.opted_out_at, now());
    NEW.opted_out_method := COALESCE(NEW.opted_out_method, 'manual');
  ELSIF NEW.marketing_status = 'active' AND OLD.marketing_status = 'opted_out' THEN
    NEW.opted_out_at := NULL;
    NEW.opted_out_method := NULL;
    NEW.opted_out_campaign_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_opt_out_metadata ON public.customers;
CREATE TRIGGER trg_sync_customer_opt_out_metadata
BEFORE UPDATE OF marketing_status ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_opt_out_metadata();