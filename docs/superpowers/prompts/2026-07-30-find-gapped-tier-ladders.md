# Lovable query — which orgs have a tier ladder with a hole in it?

**Status:** read-only. Nothing here changes data. Safe to run any time.
**Why:** `validateTierThresholds` was fixed on 2026-07-30 to catch sub-dollar gaps.
That fix only guards ladders saved **from now on** — it does not repair ladders
already stored with a gap.

---

## The problem

`resolve_customer_tier()` matches on inclusive bounds:

```sql
WHERE v_spend >= cts.min_spending
  AND (cts.max_spending IS NULL OR v_spend <= cts.max_spending)
```

`lifetime_spend` is `numeric(12,2)`, so the smallest step is one cent. Two tiers
are contiguous only when `next.min_spending = max_spending + 0.01`.

A ladder of `0-499 / 500-1999 / 2000-4999 / 5000-null` therefore has **three
holes**: 499.01-499.99, 1999.01-1999.99, 4999.01-4999.99. A customer who has
spent $4,999.50 matches no row, `resolve_customer_tier` returns NULL, and they
hold no tier — despite having spent more than the tier below them requires.

That shape is the **seeded default**, so it is likely to be common rather than rare.

---

## Query 1 — which orgs have gapped ladders

```sql
-- Every hole in every configured tier ladder.
-- Empty result = no org has a gap. Anything returned is a live hole.
with ladder as (
  select
    cts.organization_id,
    cts.tier_name,
    cts.min_spending,
    cts.max_spending,
    lead(cts.min_spending) over (
      partition by cts.organization_id order by cts.min_spending
    ) as next_min,
    lead(cts.tier_name) over (
      partition by cts.organization_id order by cts.min_spending
    ) as next_tier
  from public.client_tier_settings cts
)
select
  o.name                                as organization,
  l.organization_id,
  l.tier_name                           as tier_below,
  l.max_spending                        as covers_up_to,
  l.next_tier                           as tier_above,
  l.next_min                            as resumes_at,
  (l.max_spending + 0.01)               as hole_starts,
  (l.next_min - 0.01)                   as hole_ends,
  (l.next_min - l.max_spending - 0.01)  as hole_width
from ladder l
join public.organizations o on o.id = l.organization_id
where l.max_spending is not null
  and l.next_min is not null
  and l.next_min > l.max_spending + 0.01
order by o.name, l.min_spending;
```

`hole_width` of `0.99` is the seeded-default shape. Anything larger is a
hand-edited ladder with a real range missing.

## Query 2 — the part that actually matters: customers currently in a hole

A gap only hurts if someone is standing in it. This finds customers whose org
**has** tiers configured but whose spend matches none of them.

```sql
select
  o.name                as organization,
  c.organization_id,
  c.id                  as customer_id,
  c.first_name, c.last_name, c.email,
  cl.lifetime_spend
from public.customer_loyalty cl
join public.customers c      on c.id = cl.customer_id
join public.organizations o  on o.id = c.organization_id
where exists (
        select 1 from public.client_tier_settings cts
        where cts.organization_id = c.organization_id
      )
  and not exists (
        select 1 from public.client_tier_settings cts
        where cts.organization_id = c.organization_id
          and cl.lifetime_spend >= cts.min_spending
          and (cts.max_spending is null or cl.lifetime_spend <= cts.max_spending)
      )
order by cl.lifetime_spend desc;
```

Two different causes show up here and they need different fixes:

- **spend BELOW the lowest `min_spending`** — not a gap. The org simply has no
  entry tier starting at 0. Working as configured; leave it alone.
- **spend BETWEEN two tiers** — a customer in a hole. Cross-reference against
  Query 1's ranges.

## Query 3 — the seeded default, for scale

```sql
select count(distinct organization_id) as orgs_with_the_default_holey_ladder
from public.client_tier_settings
where max_spending in (499, 1999, 4999);
```

---

## What to do with the results

**Do not bulk-update anything.** Closing a gap by raising `max_spending` to
`next_min - 0.01` is almost certainly the right repair, but it silently promotes
whoever is standing in the hole into the tier below — which changes what they see
in the portal. That is a business decision, not a data cleanup, so bring the
numbers back before changing rows.

If Query 2 returns nothing, the gaps are real but unoccupied: fix them at leisure
when each org next edits its ladder, since the validator now warns.
