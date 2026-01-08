-- Add conversation_type column to sms_conversations
ALTER TABLE public.sms_conversations 
ADD COLUMN IF NOT EXISTS conversation_type TEXT DEFAULT 'client';

-- Add RLS policy to allow deleting conversations
CREATE POLICY "Users can delete their org conversations"
ON public.sms_conversations
FOR DELETE
USING (organization_id IN (
  SELECT org_memberships.organization_id 
  FROM org_memberships 
  WHERE org_memberships.user_id = auth.uid()
));

-- Add RLS policy to allow deleting messages
CREATE POLICY "Users can delete their org messages"
ON public.sms_messages
FOR DELETE
USING (organization_id IN (
  SELECT org_memberships.organization_id 
  FROM org_memberships 
  WHERE org_memberships.user_id = auth.uid()
));