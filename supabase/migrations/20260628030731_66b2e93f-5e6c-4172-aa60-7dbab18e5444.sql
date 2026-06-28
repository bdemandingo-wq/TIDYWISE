
WITH ranked AS (
  SELECT c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.organization_id, c.customer_phone
      ORDER BY (SELECT COUNT(*) FROM sms_messages m WHERE m.conversation_id = c.id) DESC,
               c.last_message_at DESC NULLS LAST,
               c.created_at ASC
    ) AS keep_id
  FROM sms_conversations c
),
mapping AS (SELECT id AS old_id, keep_id FROM ranked WHERE id <> keep_id)
UPDATE sms_messages m SET conversation_id = mapping.keep_id
FROM mapping WHERE m.conversation_id = mapping.old_id;

WITH ranked AS (
  SELECT c.id,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY c.organization_id, c.customer_phone
      ORDER BY (SELECT COUNT(*) FROM sms_messages m WHERE m.conversation_id = c.id) DESC,
               c.last_message_at DESC NULLS LAST,
               c.created_at ASC
    ) AS keep_id
  FROM sms_conversations c
)
DELETE FROM sms_conversations c USING ranked r
WHERE c.id = r.id AND r.id <> r.keep_id;

UPDATE sms_conversations c
SET last_message_at = COALESCE(s.last_at, c.last_message_at)
FROM (SELECT conversation_id, MAX(sent_at) AS last_at FROM sms_messages GROUP BY conversation_id) s
WHERE c.id = s.conversation_id;

CREATE UNIQUE INDEX IF NOT EXISTS sms_conversations_org_phone_uniq
  ON sms_conversations (organization_id, customer_phone);
