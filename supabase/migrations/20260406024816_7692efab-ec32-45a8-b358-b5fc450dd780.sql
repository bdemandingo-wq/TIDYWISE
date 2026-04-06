ALTER TABLE public.additional_charges DROP CONSTRAINT additional_charges_organization_id_fkey;
ALTER TABLE public.additional_charges ADD CONSTRAINT additional_charges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.automated_review_sms_queue DROP CONSTRAINT automated_review_sms_queue_organization_id_fkey;
ALTER TABLE public.automated_review_sms_queue ADD CONSTRAINT automated_review_sms_queue_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.client_portal_users DROP CONSTRAINT client_portal_users_organization_id_fkey;
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.deposit_requests DROP CONSTRAINT deposit_requests_organization_id_fkey;
ALTER TABLE public.deposit_requests ADD CONSTRAINT deposit_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.invoices DROP CONSTRAINT invoices_organization_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.page_seo_metadata DROP CONSTRAINT page_seo_metadata_organization_id_fkey;
ALTER TABLE public.page_seo_metadata ADD CONSTRAINT page_seo_metadata_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.recurring_offer_queue DROP CONSTRAINT recurring_offer_queue_organization_id_fkey;
ALTER TABLE public.recurring_offer_queue ADD CONSTRAINT recurring_offer_queue_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.short_urls DROP CONSTRAINT short_urls_organization_id_fkey;
ALTER TABLE public.short_urls ADD CONSTRAINT short_urls_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.staff_documents DROP CONSTRAINT staff_documents_organization_id_fkey;
ALTER TABLE public.staff_documents ADD CONSTRAINT staff_documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE public.tips DROP CONSTRAINT tips_organization_id_fkey;
ALTER TABLE public.tips ADD CONSTRAINT tips_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;