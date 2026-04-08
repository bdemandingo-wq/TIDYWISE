
CREATE TABLE public.user_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  session_id uuid REFERENCES public.user_sessions(id) ON DELETE CASCADE,
  page_path text NOT NULL,
  page_title text,
  visited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own page views"
  ON public.user_page_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own page views"
  ON public.user_page_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_page_views_email ON public.user_page_views(user_email);
CREATE INDEX idx_user_page_views_user_id ON public.user_page_views(user_id);
