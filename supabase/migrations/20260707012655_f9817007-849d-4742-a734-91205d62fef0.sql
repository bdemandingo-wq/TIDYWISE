
-- 1) customer_loyalty: add direct organization_id column
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.customer_loyalty cl
SET organization_id = c.organization_id
FROM public.customers c
WHERE cl.customer_id = c.id
  AND cl.organization_id IS DISTINCT FROM c.organization_id;

CREATE INDEX IF NOT EXISTS idx_customer_loyalty_org
  ON public.customer_loyalty(organization_id);

-- Backfill trigger to keep organization_id set on insert
CREATE OR REPLACE FUNCTION public.customer_loyalty_set_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.customer_id IS NOT NULL THEN
    SELECT c.organization_id INTO NEW.organization_id
    FROM public.customers c WHERE c.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_loyalty_set_org ON public.customer_loyalty;
CREATE TRIGGER trg_customer_loyalty_set_org
BEFORE INSERT OR UPDATE ON public.customer_loyalty
FOR EACH ROW EXECUTE FUNCTION public.customer_loyalty_set_org();

-- Replace existing policies with direct org-scoped ones (keep customer self-view)
DROP POLICY IF EXISTS "Org admins can manage customer loyalty" ON public.customer_loyalty;
DROP POLICY IF EXISTS "Org staff can view customer loyalty" ON public.customer_loyalty;

CREATE POLICY "Org members can manage customer loyalty"
ON public.customer_loyalty
FOR ALL
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id))
WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- 2) estimates: drop overly-permissive public quote-token policy
DROP POLICY IF EXISTS "Public can view by quote token" ON public.estimates;

-- 3) storage: restrict staff-avatars SELECT to files matching avatar.<ext>
DROP POLICY IF EXISTS "Anyone can view staff avatars" ON storage.objects;

CREATE POLICY "Anyone can view staff avatar files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'staff-avatars'
  AND (storage.foldername(name))[2] IS NULL  -- exactly 2-segment path {userId}/avatar.ext
  AND split_part(name, '/', 2) LIKE 'avatar.%'
);
