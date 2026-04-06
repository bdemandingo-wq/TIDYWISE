ALTER TABLE public.additional_charges DROP CONSTRAINT additional_charges_created_by_fkey;
ALTER TABLE public.additional_charges ADD CONSTRAINT additional_charges_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.manual_payments DROP CONSTRAINT manual_payments_created_by_fkey;
ALTER TABLE public.manual_payments ADD CONSTRAINT manual_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;