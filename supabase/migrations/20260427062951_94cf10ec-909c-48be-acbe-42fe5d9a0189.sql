
-- 1. REVIEW REQUESTS: drop insecure public policies
DROP POLICY IF EXISTS "Anyone can read review request by token" ON public.review_requests;
DROP POLICY IF EXISTS "Anyone can update review request by token" ON public.review_requests;

-- 2. Secure RPC: read a single review request by token (SECURITY DEFINER bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.get_review_request_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  booking_id uuid,
  customer_id uuid,
  staff_id uuid,
  rating integer,
  review_text text,
  status text,
  google_review_url text,
  responded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT rr.id, rr.booking_id, rr.customer_id, rr.staff_id,
         rr.rating, rr.review_text, rr.status,
         rr.google_review_url, rr.responded_at
  FROM public.review_requests rr
  WHERE rr.review_link_token = p_token
  LIMIT 1;
END;
$$;

-- 3. Secure RPC: submit a rating/review using the token
CREATE OR REPLACE FUNCTION public.submit_review_by_token(
  p_token text,
  p_rating integer,
  p_review_text text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN false;
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN false;
  END IF;

  SELECT id INTO v_id
  FROM public.review_requests
  WHERE review_link_token = p_token
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.review_requests
  SET rating = p_rating,
      review_text = COALESCE(p_review_text, review_text),
      status = 'responded',
      responded_at = COALESCE(responded_at, now())
  WHERE id = v_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_review_request_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review_by_token(text, integer, text) TO anon, authenticated;

-- 4. AI_REPLY_LOCKS: add organization_id and scope policy
ALTER TABLE public.ai_reply_locks
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Authenticated users can manage ai reply locks" ON public.ai_reply_locks;

-- Org members may read locks for their own org
CREATE POLICY "Org members read own ai reply locks"
ON public.ai_reply_locks
FOR SELECT
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- Org admins may insert locks scoped to their org
CREATE POLICY "Org admins insert own ai reply locks"
ON public.ai_reply_locks
FOR INSERT
TO authenticated
WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

-- Org admins may delete their own locks (cleanup)
CREATE POLICY "Org admins delete own ai reply locks"
ON public.ai_reply_locks
FOR DELETE
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));
