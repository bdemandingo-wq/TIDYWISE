alter table public.lead_notification_sends
  add column if not exists phone_key text;

create index if not exists lead_notification_sends_org_phone_recent_idx
  on public.lead_notification_sends (organization_id, phone_key, claimed_at desc)
  where phone_key is not null;

update public.lead_notification_sends s
set phone_key = right(regexp_replace(l.phone, '\D', '', 'g'), 10)
from public.leads l
where l.id = s.lead_id
  and s.phone_key is null
  and l.phone is not null
  and length(regexp_replace(l.phone, '\D', '', 'g')) >= 10;