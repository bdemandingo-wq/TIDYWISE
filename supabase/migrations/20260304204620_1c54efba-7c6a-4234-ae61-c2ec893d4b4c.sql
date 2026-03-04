-- Hard reset: clear all SMS messages and conversations
DELETE FROM public.sms_messages;
DELETE FROM public.sms_conversations;