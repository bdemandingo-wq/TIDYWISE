
ALTER TABLE public.cancellation_feedback ADD COLUMN IF NOT EXISTS kept_text text;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS require_cleaner_payout_setup boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Platform admin can view all cancellation feedback" ON public.cancellation_feedback;
CREATE POLICY "Platform admin can view all cancellation feedback"
  ON public.cancellation_feedback
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
