-- Add quality scoring columns to blog_posts
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS quality_score integer,
  ADD COLUMN IF NOT EXISTS quality_notes text;

-- Create keyword queue
CREATE TABLE IF NOT EXISTS public.blog_keyword_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  intent text,
  priority integer NOT NULL DEFAULT 5,
  search_volume text,
  opportunity text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  generated_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Validation triggers (instead of CHECK constraints)
CREATE OR REPLACE FUNCTION public.validate_blog_keyword_queue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('queued','in_progress','completed','failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be queued, in_progress, completed, or failed.', NEW.status;
  END IF;
  IF NEW.intent IS NOT NULL AND NEW.intent NOT IN ('top_funnel','middle_funnel','bottom_funnel') THEN
    RAISE EXCEPTION 'Invalid intent: %. Must be top_funnel, middle_funnel, or bottom_funnel.', NEW.intent;
  END IF;
  IF NEW.priority < 1 OR NEW.priority > 10 THEN
    RAISE EXCEPTION 'Invalid priority: %. Must be between 1 and 10.', NEW.priority;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_blog_keyword_queue_trigger ON public.blog_keyword_queue;
CREATE TRIGGER validate_blog_keyword_queue_trigger
  BEFORE INSERT OR UPDATE ON public.blog_keyword_queue
  FOR EACH ROW EXECUTE FUNCTION public.validate_blog_keyword_queue();

DROP TRIGGER IF EXISTS update_blog_keyword_queue_updated_at ON public.blog_keyword_queue;
CREATE TRIGGER update_blog_keyword_queue_updated_at
  BEFORE UPDATE ON public.blog_keyword_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_blog_keyword_queue_status_priority
  ON public.blog_keyword_queue (status, priority, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_keyword_queue_keyword_lower
  ON public.blog_keyword_queue (lower(keyword));

ALTER TABLE public.blog_keyword_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view keyword queue"
  ON public.blog_keyword_queue FOR SELECT
  TO authenticated
  USING (public.is_platform_blog_admin());

CREATE POLICY "Platform admins can insert keyword queue"
  ON public.blog_keyword_queue FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_blog_admin());

CREATE POLICY "Platform admins can update keyword queue"
  ON public.blog_keyword_queue FOR UPDATE
  TO authenticated
  USING (public.is_platform_blog_admin())
  WITH CHECK (public.is_platform_blog_admin());

CREATE POLICY "Platform admins can delete keyword queue"
  ON public.blog_keyword_queue FOR DELETE
  TO authenticated
  USING (public.is_platform_blog_admin());

-- Service role policy for edge functions
CREATE POLICY "Service role full access to keyword queue"
  ON public.blog_keyword_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);