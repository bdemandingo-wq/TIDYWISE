CREATE TABLE IF NOT EXISTS public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read site_content" ON public.site_content
  FOR SELECT USING (true);

CREATE POLICY "Admins can update site_content" ON public.site_content
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert site_content" ON public.site_content
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));