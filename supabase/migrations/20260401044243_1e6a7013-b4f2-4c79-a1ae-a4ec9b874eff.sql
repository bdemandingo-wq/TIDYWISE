CREATE TABLE IF NOT EXISTS public.ai_reply_log (
  inbound_message_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_reply_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.ai_reply_log
  FOR ALL USING (false);
