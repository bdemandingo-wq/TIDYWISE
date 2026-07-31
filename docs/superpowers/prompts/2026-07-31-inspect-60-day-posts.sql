-- Show the sentence around every "60 day" occurrence in the three flagged posts.
-- Read-only. Edits nothing.
select
  slug,
  status,
  published_at,
  m.match           as context
from public.blog_posts p
cross join lateral (
  select regexp_matches(
    regexp_replace(p.content, '<[^>]+>', ' ', 'g'),   -- strip tags so sentences read cleanly
    '.{0,220}60[- ]?day.{0,220}',
    'gi'
  ) as match
) m
where p.slug in (
  'crm-for-cleaning-business',
  'best-jobber-alternatives-for-cleaning-businesses',
  'cleaning-marketplace-vs-your-own-software'
)
order by p.status, p.slug;

-- Same for meta fields, which the body query above cannot see.
select slug, status, meta_title, meta_description
from public.blog_posts
where slug in (
  'crm-for-cleaning-business',
  'best-jobber-alternatives-for-cleaning-businesses',
  'cleaning-marketplace-vs-your-own-software'
)
  and (meta_title ilike '%60%day%' or meta_description ilike '%60%day%');

-- Control: does the DB hold a post at the slug Google is showing?
-- If this returns nothing, that URL is served only by the hardcoded src/ page.
select slug, status, published_at, updated_at,
       left(regexp_replace(content, '<[^>]+>', ' ', 'g'), 300) as opening
from public.blog_posts
where slug in ('best-software-for-cleaning-business', 'best-software-for-cleaners');
