
-- Chat conversations table
CREATE TABLE public.admin_chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages table
CREATE TABLE public.admin_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.admin_chat_conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies: org members can access their org's chats
CREATE POLICY "Org members can view conversations"
  ON public.admin_chat_conversations FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can create conversations"
  ON public.admin_chat_conversations FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Org members can update conversations"
  ON public.admin_chat_conversations FOR UPDATE
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can delete conversations"
  ON public.admin_chat_conversations FOR DELETE
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can view messages"
  ON public.admin_chat_messages FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can create messages"
  ON public.admin_chat_messages FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));

-- Indexes
CREATE INDEX idx_admin_chat_conversations_org ON public.admin_chat_conversations(organization_id);
CREATE INDEX idx_admin_chat_messages_conv ON public.admin_chat_messages(conversation_id);

-- Updated_at trigger
CREATE TRIGGER update_admin_chat_conversations_updated_at
  BEFORE UPDATE ON public.admin_chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
