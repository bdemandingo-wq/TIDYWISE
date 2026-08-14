ALTER TABLE public.org_memberships DISABLE TRIGGER USER;

delete from public.org_memberships
where organization_id in ('a959b00e-0d0a-428f-86d1-13a0653c154f',
                          'e5702654-68bd-44d7-97d3-7430c90420d8');

delete from public.organizations
where id in ('a959b00e-0d0a-428f-86d1-13a0653c154f',
             'e5702654-68bd-44d7-97d3-7430c90420d8');

ALTER TABLE public.org_memberships ENABLE TRIGGER USER;