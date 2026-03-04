-- Remove duplicate openphone_message_id rows, keeping only the earliest
DELETE FROM public.sms_messages
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY openphone_message_id ORDER BY sent_at ASC) AS rn
    FROM public.sms_messages
    WHERE openphone_message_id IS NOT NULL
  ) sub WHERE rn > 1
);

-- Now create unique index
DROP INDEX IF EXISTS idx_sms_messages_openphone_id;
CREATE UNIQUE INDEX idx_sms_messages_openphone_id ON public.sms_messages (openphone_message_id) WHERE openphone_message_id IS NOT NULL;