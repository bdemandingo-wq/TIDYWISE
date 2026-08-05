-- One-time data migration: legacy business_settings.review_sms_template ->
-- organization_automations.settings.templates.review_request

update organization_automations a
set settings = coalesce(a.settings, '{}'::jsonb)
             || jsonb_build_object(
                  'templates',
                  coalesce(a.settings -> 'templates', '{}'::jsonb)
                  || jsonb_build_object('review_request', btrim(b.review_sms_template))
                ),
    updated_at = now()
from business_settings b
where b.organization_id = a.organization_id
  and a.automation_type = 'review_request'
  and nullif(btrim(b.review_sms_template), '') is not null
  and btrim(b.review_sms_template) <> 'Hi {customer_name}, thank you for choosing {company_name}!
We''d love to hear about your experience. Please take a moment to leave us a review:
{review_link}'
  -- THE GUARD: never overwrite something already in the new store.
  and nullif(btrim(a.settings -> 'templates' ->> 'review_request'), '') is null;

insert into organization_automations (organization_id, automation_type, is_enabled, settings)
select b.organization_id,
       'review_request',
       false,
       jsonb_build_object(
         'templates',
         jsonb_build_object('review_request', btrim(b.review_sms_template))
       )
from business_settings b
where nullif(btrim(b.review_sms_template), '') is not null
  and btrim(b.review_sms_template) <> 'Hi {customer_name}, thank you for choosing {company_name}!
We''d love to hear about your experience. Please take a moment to leave us a review:
{review_link}'
  and not exists (
    select 1 from organization_automations a
    where a.organization_id = b.organization_id
      and a.automation_type = 'review_request'
  );