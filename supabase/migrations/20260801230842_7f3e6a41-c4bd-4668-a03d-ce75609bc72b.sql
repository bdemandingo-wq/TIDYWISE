ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS processing_fee_flat NUMERIC NOT NULL DEFAULT 0.30;

COMMENT ON COLUMN public.payroll_settings.processing_fee_flat IS
'Fixed component of the card processing fee, per transaction — the "+ 30c" half
of "2.9% + 30c". Applied in addition to processing_fee_percent whenever
processing_fee_mode = ''percent''. Set to 0 for a processor with no fixed fee.
Deliberately a FIELD rather than a new processing_fee_mode value: percent-plus-
fixed is one fee structure, not two, and a processor without a fixed component is
just flat = 0.
The fee is only charged on bookings where payment_intent_id IS NOT NULL, i.e.
money actually went through Stripe. Cash, cheque and bank transfer jobs cost
nothing to process and are no longer charged a notional fee.';