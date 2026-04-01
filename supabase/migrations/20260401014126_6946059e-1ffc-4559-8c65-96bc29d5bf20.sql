CREATE TABLE public.ai_reply_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_reply_locks_conversation ON public.ai_reply_locks (conversation_id);

ALTER TABLE public.ai_reply_locks ENABLE ROW LEVEL SECURITY;