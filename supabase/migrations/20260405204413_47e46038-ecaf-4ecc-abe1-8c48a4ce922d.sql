
CREATE TABLE public.demo_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_name TEXT NOT NULL,
  team_size TEXT,
  biggest_challenge TEXT,
  preferred_days TEXT[],
  preferred_time TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can submit demo requests"
  ON public.demo_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only platform admin can read
CREATE POLICY "Platform admin can read demo requests"
  ON public.demo_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR auth.jwt()->>'email' = 'support@tidywisecleaning.com'
  );

-- Only platform admin can update (status, notes)
CREATE POLICY "Platform admin can update demo requests"
  ON public.demo_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR auth.jwt()->>'email' = 'support@tidywisecleaning.com'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR auth.jwt()->>'email' = 'support@tidywisecleaning.com'
  );
