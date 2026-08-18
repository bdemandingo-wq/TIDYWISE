CREATE TABLE public.product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  topic text NOT NULL,
  message text NOT NULL,
  app_area text,
  severity text,
  sender_name text,
  reply_email text,
  is_read boolean NOT NULL DEFAULT false,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_feedback_topic_chk CHECK (topic IN ('broken','suggestion','like','dislike','other')),
  CONSTRAINT product_feedback_severity_chk CHECK (severity IS NULL OR severity IN ('blocking','annoying','idea')),
  CONSTRAINT product_feedback_message_chk CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000),
  CONSTRAINT product_feedback_area_chk CHECK (app_area IS NULL OR char_length(app_area) <= 200),
  CONSTRAINT product_feedback_name_chk CHECK (sender_name IS NULL OR char_length(sender_name) <= 200),
  CONSTRAINT product_feedback_email_chk CHECK (reply_email IS NULL OR char_length(reply_email) <= 255)
);

CREATE INDEX product_feedback_created_at_idx ON public.product_feedback (created_at DESC, id DESC);
CREATE INDEX product_feedback_org_idx ON public.product_feedback (organization_id);

GRANT SELECT, INSERT ON public.product_feedback TO authenticated;
GRANT UPDATE (is_read, admin_note, updated_at) ON public.product_feedback TO authenticated;
GRANT ALL ON public.product_feedback TO service_role;

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may send feedback, but only ever as themselves: user_id is
-- pinned to auth.uid() so a submission cannot be attributed to someone else.
CREATE POLICY "Signed-in users can send feedback"
  ON public.product_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Platform admin reads all feedback"
  ON public.product_feedback FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Members read their own organisation's feedback"
  ON public.product_feedback FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.get_user_organization_id()
  );

-- Triage (read flag / note) is the platform admin's alone. No DELETE policy
-- and no UPDATE policy for anyone else, so a submission cannot be altered or
-- removed after it is sent.
CREATE POLICY "Platform admin triages feedback"
  ON public.product_feedback FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE TRIGGER product_feedback_set_updated_at
  BEFORE UPDATE ON public.product_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.product_feedback IS
'Product feedback sent from Settings > Feedback. Replaced a Jotform embed on 2026-08-18: submissions now live here so they are readable in-app at /dashboard/platform-feedback. organization_id and user_id are attached automatically by the client from the authenticated session, never typed by the sender.';