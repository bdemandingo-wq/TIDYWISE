# Lovable query — are there duplicate recurring series?

**Status:** read-only. Changes nothing. Safe to run any time.
**Why:** the display side was fixed in `src/` on 2026-07-30. This answers the separate
question of whether the underlying rows are also wrong.
**Related:** `docs/bugs/2026-07-30-recurring-bookings-count.md`

---

## What was already fixed, so you know what these numbers mean now

- Recurring tab tile relabelled **"Schedules"** — still a row count, now named as one
- Reports **"Recurring Plans"** now filters `is_active`, so paused schedules no longer count
- P&L **"Recurring Clients"** cards stopped receiving the row count and use their own
  deduplicated figure

So the displayed numbers are honest about what they measure. **These queries ask whether
what they measure contains redundant rows.**

Nothing prevents duplicates: there is no unique constraint on `recurring_bookings`, and
`RecurringBookingsPage`'s create path is a bare insert with no existence check.

---

## Query 1 — the one that decides whether there is a problem

```sql
select c.first_name || ' ' || c.last_name                            as customer,
       c.email,
       count(*)                                                      as series,
       count(distinct lower(trim(coalesce(r.address,''))))           as distinct_addresses,
       count(*) filter (where r.is_active)                           as active_series,
       string_agg(distinct coalesce(nullif(trim(r.address),''),'(no address)'), ' | ')
                                                                     as addresses
from public.recurring_bookings r
join public.customers c on c.id = r.customer_id
group by c.id, c.first_name, c.last_name, c.email
having count(*) > 1
order by count(*) desc, customer;
```

**How to read it:**

- `series = distinct_addresses` → **legitimate.** One schedule per property. Nothing to fix.
- `series > distinct_addresses` → **redundant rows.** The same customer has more than one
  schedule at the same address.
- `distinct_addresses` includes `'(no address)'` as one value, so a customer with two
  address-less series shows `series=2, distinct_addresses=1` — correctly flagged.

## Query 2 — exact duplicates, with timestamps that explain how they happened

```sql
select r.customer_id,
       c.first_name || ' ' || c.last_name                as customer,
       lower(trim(coalesce(r.address,'')))               as addr,
       count(*)                                          as copies,
       count(*) filter (where r.is_active)               as active_copies,
       array_agg(r.id order by r.created_at)             as ids,
       array_agg(r.created_at order by r.created_at)     as created,
       array_agg(r.frequency order by r.created_at)      as frequencies,
       array_agg(r.total_amount order by r.created_at)   as amounts
from public.recurring_bookings r
join public.customers c on c.id = r.customer_id
group by 1,2,3
having count(*) > 1
order by count(*) desc;
```

**The `created` timestamps are the diagnostic:**

- **Seconds apart** → a double-submit. The fix is a guard on the create path (and possibly
  a unique constraint), not a policy change.
- **Days or weeks apart** → deliberate re-creation, probably because someone could not find
  the existing one or wanted to change frequency and made a new row instead. That is a UX
  problem, and a constraint would block a workflow people are relying on.
- **Different `frequencies` or `amounts`** → likely intentional. A customer on weekly
  kitchens and monthly deep-cleans is two real schedules at one address.

That last case matters: it means **"same customer + same address" is not automatically
wrong**, and a blind unique constraint on `(customer_id, address)` would break it. Check
this column before deciding on any constraint.

## Query 3 — size the gap between the three possible numbers

```sql
select
  count(*)                                                       as rows_total,
  count(*) filter (where is_active)                              as rows_active,
  count(distinct customer_id) filter (where is_active)           as customers_active,
  count(distinct (customer_id, lower(trim(coalesce(address,'')))))
    filter (where is_active)                                     as customer_addresses_active
from public.recurring_bookings;
```

`rows_active − customer_addresses_active` is the exact count of redundant active rows.
If that is 0, there is no data problem and the display fixes were the whole of it.

## Query 4 — confirm the live schema really has no uniqueness

Per CLAUDE.md rule 4b, the migration files are a hypothesis. Ask the database:

```sql
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.recurring_bookings'::regclass
order by contype, conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'recurring_bookings';
```

Expected: a `frequency` CHECK, FKs to customers/services/staff, and a **non-unique**
`idx_recurring_bookings_org`. If a unique index exists that no migration mentions, that
changes the picture entirely — duplicates would then be impossible and the inflation
would have to come from somewhere else.

## Query 5 — do the duplicates actually generate duplicate work?

The count being inflated is cosmetic. **This is the one that would cost real money**, so
worth running even if queries 1–3 look clean:

```sql
-- Bookings generated from a customer+address that holds more than one active series,
-- landing on the same day. Two schedules quietly generating two visits to one house.
with dup as (
  select customer_id, lower(trim(coalesce(address,''))) as addr
  from public.recurring_bookings
  where is_active
  group by 1,2 having count(*) > 1
)
select b.customer_id, b.address, b.scheduled_at::date as day, count(*) as bookings_that_day,
       array_agg(b.booking_number order by b.created_at) as booking_numbers
from public.bookings b
join dup d
  on d.customer_id = b.customer_id
 and d.addr = lower(trim(coalesce(b.address,'')))
where b.scheduled_at > now() - interval '90 days'
group by 1,2,3
having count(*) > 1
order by day desc;
```

If this returns rows, duplicate series are producing duplicate visits — which means
cleaners have been dispatched twice and customers may have been charged twice. That is a
different order of problem from a wrong tile, and it would be the thing to fix first.

---

## What to bring back

Just the outputs. Specifically:

1. Whether query 3's `rows_active − customer_addresses_active` is zero
2. If not, whether query 2's `created` timestamps cluster (double-submit) or spread
   (deliberate), and whether `frequencies`/`amounts` differ
3. Whether query 5 returns anything at all

**Do not delete or deactivate any rows on the strength of these.** A same-address pair
with different frequencies is probably legitimate, and the merge-style cleanup would need
its own decision about which row survives and what happens to bookings already generated
from the other.
