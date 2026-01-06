-- Create messages table for SMS conversation history
CREATE TABLE public.sms_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.sms_conversations(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  openphone_message_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create offline sync queue for offline mode
CREATE TABLE public.offline_sync_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  table_name TEXT NOT NULL,
  record_data JSONB NOT NULL,
  synced BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  synced_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_conversations
CREATE POLICY "Users can view their org conversations"
ON public.sms_conversations FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create conversations for their org"
ON public.sms_conversations FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their org conversations"
ON public.sms_conversations FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- RLS Policies for sms_messages
CREATE POLICY "Users can view their org messages"
ON public.sms_messages FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create messages for their org"
ON public.sms_messages FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- RLS Policies for offline_sync_queue
CREATE POLICY "Users can view their own sync queue"
ON public.offline_sync_queue FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own sync items"
ON public.offline_sync_queue FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sync items"
ON public.offline_sync_queue FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sync items"
ON public.offline_sync_queue FOR DELETE
USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_sms_conversations_org ON public.sms_conversations(organization_id);
CREATE INDEX idx_sms_conversations_phone ON public.sms_conversations(customer_phone);
CREATE INDEX idx_sms_messages_conversation ON public.sms_messages(conversation_id);
CREATE INDEX idx_offline_sync_queue_user ON public.offline_sync_queue(user_id, synced);