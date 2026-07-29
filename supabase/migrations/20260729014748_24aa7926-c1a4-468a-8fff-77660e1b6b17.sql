-- campaign_sms_sends serves two purposes: it is the dedupe source for
-- "already received this campaign", and it is the evidentiary record of what
-- was actually sent to whom and when. The unique constraint on
-- (campaign_id, customer_id) optimised the first at the cost of the second:
-- a legitimate second send to the same customer within a campaign could not
-- be recorded at all, and the insert failed with 23505 after the SMS had
-- already been delivered. For SMS marketing with per-message statutory
-- damages, the send history is worth more than the storage it costs.
--
-- Dedupe is now performed by an explicit EXISTS-style check in
-- run-inactive-campaign (chunked and scoped to the candidate batch), and by
-- explicit pre-checks before enrolment in the admin UI, rather than by
-- relying on a write failure.

ALTER TABLE public.campaign_sms_sends
  DROP CONSTRAINT IF EXISTS campaign_sms_sends_campaign_id_customer_id_key;

-- Replacement: same column pair, NON-unique, so the dedupe and enrolment
-- lookups that used to ride the unique index stay fast.
CREATE INDEX IF NOT EXISTS idx_campaign_sms_sends_campaign_customer
  ON public.campaign_sms_sends (campaign_id, customer_id);