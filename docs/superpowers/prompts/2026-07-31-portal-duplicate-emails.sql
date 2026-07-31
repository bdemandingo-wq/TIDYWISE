-- Portal login cross-tenant sizing. READ ONLY. Changes nothing.
-- Q1 decides whether the bug is live today or latent.
-- Plan: docs/superpowers/plans/2026-07-31-portal-login-cross-tenant.md

-- Q1. THE ONE THAT DECIDES IT. Emails with a portal login at more than one
--     business. Every row here is a customer who can be rejected with a
--     correct password right now.
select lower(c.email)                          as email,
       count(*)                                as portal_accounts,
       count(distinct c.organization_id)       as businesses,
       string_agg(distinct o.name, ' | ')      as business_names,
       max(cpu.last_login_at)                  as most_recent_login
from public.client_portal_users cpu
join public.customers c     on c.id = cpu.customer_id
join public.organizations o on o.id = c.organization_id
where c.email is not null and c.email <> ''
group by lower(c.email)
having count(distinct c.organization_id) > 1
order by count(*) desc;

-- Q2. The latent population: shared emails among ALL customers, whether or not
--     they have a portal login yet. This is how many could become Q1 the moment
--     a second business enables portal access for them.
select count(*) as emails_shared_across_businesses
from (
  select lower(c.email)
  from public.customers c
  where c.email is not null and c.email <> ''
  group by lower(c.email)
  having count(distinct c.organization_id) > 1
) x;

-- Q3. Scale, for context.
select count(*)                                   as portal_accounts_total,
       count(distinct lower(c.email))             as distinct_emails,
       count(*) filter (where cpu.is_active)      as active_accounts
from public.client_portal_users cpu
join public.customers c on c.id = cpu.customer_id;

-- Q4. Only needed if you pick Option A: is `slug` actually usable as a public
--     key? Nulls, blanks or duplicates would each break /portal/:orgSlug.
select count(*)                                              as orgs,
       count(*) filter (where slug is null or slug = '')     as missing_slug,
       count(*) - count(distinct slug)                       as duplicate_slugs
from public.organizations;
