-- Phase 1: Blog system schema upgrade

-- 1. Add new columns to blog_posts
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS target_keyword TEXT,
  ADD COLUMN IF NOT EXISTS secondary_keywords TEXT[],
  ADD COLUMN IF NOT EXISTS word_count INTEGER,
  ADD COLUMN IF NOT EXISTS ai_model_used TEXT,
  ADD COLUMN IF NOT EXISTS generation_prompt TEXT,
  ADD COLUMN IF NOT EXISTS internal_links JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_image_url TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT 'TidyWise Team',
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 2. Validation trigger for status (immutable; not a CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_blog_post_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'review', 'published', 'archived') THEN
    RAISE EXCEPTION 'Invalid blog status: %. Must be draft, review, published, or archived.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_blog_post_status ON public.blog_posts;
CREATE TRIGGER trg_validate_blog_post_status
  BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_blog_post_status();

-- 3. Migrate existing data:
--    - All currently published posts -> 'published'
--    - All others (the 270 we just unpublished) -> 'archived'
UPDATE public.blog_posts
SET status = CASE WHEN is_published = true THEN 'published' ELSE 'archived' END;

-- 4. Backfill word_count for existing posts (rough estimate from content length)
UPDATE public.blog_posts
SET word_count = GREATEST(1, array_length(regexp_split_to_array(regexp_replace(content, '<[^>]+>', ' ', 'g'), '\s+'), 1))
WHERE word_count IS NULL;

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published_at ON public.blog_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_target_keyword ON public.blog_posts(target_keyword);

-- 6. Helper function: is the caller a platform admin (owner/admin of TidyWise org)?
CREATE OR REPLACE FUNCTION public.is_platform_blog_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_memberships
    WHERE user_id = auth.uid()
      AND organization_id = 'e95b92d0-7099-408e-a773-e4407b34f8b4'
      AND role IN ('owner', 'admin')
  );
$$;

-- 7. RLS policies on blog_posts
-- Make sure RLS is enabled
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Drop any old policies so we can re-create cleanly
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='blog_posts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.blog_posts', pol.policyname);
  END LOOP;
END $$;

-- Public can read published posts only
CREATE POLICY "Public can read published blog posts"
  ON public.blog_posts
  FOR SELECT
  USING (status = 'published');

-- Platform blog admins can read everything (drafts, review, archived)
CREATE POLICY "Platform admins can read all blog posts"
  ON public.blog_posts
  FOR SELECT
  TO authenticated
  USING (public.is_platform_blog_admin());

-- Platform blog admins can insert
CREATE POLICY "Platform admins can insert blog posts"
  ON public.blog_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_blog_admin());

-- Platform blog admins can update
CREATE POLICY "Platform admins can update blog posts"
  ON public.blog_posts
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_blog_admin())
  WITH CHECK (public.is_platform_blog_admin());

-- Platform blog admins can delete
CREATE POLICY "Platform admins can delete blog posts"
  ON public.blog_posts
  FOR DELETE
  TO authenticated
  USING (public.is_platform_blog_admin());