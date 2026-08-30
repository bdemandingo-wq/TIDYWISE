DROP INDEX IF EXISTS public.uq_admin_system_notif_dedupe;
CREATE UNIQUE INDEX uq_admin_system_notif_dedupe
  ON public.admin_system_notifications USING btree (organization_id, dedupe_key);

DROP INDEX IF EXISTS public.payment_evidence_pi_unique;
CREATE UNIQUE INDEX payment_evidence_pi_unique
  ON public.payment_evidence USING btree (stripe_payment_intent_id);

DROP INDEX IF EXISTS public.idx_sms_messages_openphone_id;
CREATE UNIQUE INDEX idx_sms_messages_openphone_id
  ON public.sms_messages USING btree (openphone_message_id);