# The recurring bookings count — what it counts and where it spreads

**Investigated:** 2026-07-30. **Display side fixed same day** — see "What was done" at the foot.
The data question is separate and queued:
`docs/superpowers/prompts/2026-07-30-find-duplicate-recurring-series.md`

**Short answer: it counts rows, nothing prevents duplicate rows, and the row count
overrides a correctly-deduplicated figure on the P&L under a label that says
"Clients".** Whether the underlying rows are *wrong* is a data question I cannot answer
from here — query at the bottom.

---

## 1. What the count actually counts

**Rows in `recurring_bookings`.** No deduplication, no grouping.

`RecurringBookingsPage.tsx:560-561, 582, 600`:

```ts
const activeCount = recurringBookings.filter(b => b.is_active).length;
const pausedCount = recurringBookings.filter(b => !b.is_active).length;
…
subtitle={`${recurringBookings.length} recurring schedules`}
<p className="text-2xl font-bold mt-1">{recurringBookings.length}</p>
```

The query behind it selects every row for the org with no filter beyond
`organization_id`, so your 30 / 20 / 10 is 30 rows, 20 with `is_active = true`, 10
without.

**The page header is already honest** — it says *"30 recurring schedules"*, not
customers. It is the tile above it, and the two downstream readers in §4, that invite
the wrong reading.

## 2. Same customer, same address — or different addresses?

**Cannot be determined from the code, but the table can answer it directly.**
`recurring_bookings` carries its own `address`, `city`, `state`, `zip_code` (from the
original schema), so the distinction you care about is stored and queryable. Query 1
below separates the two cases exactly.

Worth knowing before you look: because `address` lives on the **recurring row** rather
than being read from the customer, two series for one customer at one address are
genuinely redundant rows — not two views of one thing.

## 3. What prevents a second series for the same customer? Nothing

**No constraint.** Every constraint and index ever added to `recurring_bookings` across
all migrations:

- `recurring_bookings_frequency_check` — a `CHECK` on `frequency`, rewritten twice
- `recurring_bookings_staff_id_fkey` — FK, changed to `ON DELETE SET NULL`
- `idx_recurring_bookings_org` — a plain, non-unique index on `organization_id`

No unique constraint on `customer_id`, on `(customer_id, address)`, or on anything else.

**No application guard either.** `RecurringBookingsPage.tsx:289-294`:

```ts
const createMutation = useMutation({
  mutationFn: async (data: any) => {
    …
    const { error } = await supabase.from('recurring_bookings').insert({ ...data, organization_id: organization.id });
```

A bare insert. No lookup for an existing series, no warning, no confirmation. Creating
the same schedule twice is silent and instant — which is consistent with duplicates
existing.

*(Caveat per CLAUDE.md rule 4b: a constraint can exist live without appearing in any
migration. Query 4 checks the live schema rather than trusting this list.)*

## 4. What else reads it — and one of them is a category error

Two other readers, and the second is the real problem.

### `ReportsPage` — inflated, but honestly labelled

`:62` fetches the rows; `:105-110` does:

```ts
const totalRecurringPlans = recData.length;
setRecurringStats({ recurringClients: totalRecurringPlans, … });
```

Displayed at `:353-356` as a StatCard titled **"Recurring Plans"** — which is the
correct name for a row count. So the card itself is defensible.

**But two things are off.** The variable is named `recurringClients` while holding a
plan count, and — more materially — **this query has no `is_active` filter**. So Reports
counts all 30, including the 10 paused, where the Recurring tab at least splits them.
Reports is more inflated than the page you noticed it on.

*(Also `:62` carries `.limit(500)`. Harmless at 30 rows, but it is a silent cap: at 500+
the number would quietly stop growing rather than erroring.)*

### `PnLOverview` — this is the one to look at

`ReportsPage:593` passes `recurringStats` into `PnLOverview`, which renders it in **two
cards both labelled "Recurring Clients"** (`:1084` and `:1228`):

```ts
{recurringStats?.recurringClients ?? actuals.totalRecurringClients}
```

`PnLOverview` computes its **own** figure at `:444`:

```ts
totalRecurringClients: recurringAddresses.size, // Unique recurring CLIENTS count
```

**That fallback is deduplicated and the passed-in value is not, so the row count wins
and the correct number is discarded** whenever the component is rendered from Reports.

It is worse than an override, though, because the two numbers measure different things.
`recurringAddresses` (`:419-427`) is built from **observed booking behaviour** — addresses
that appear in more than one distinct month:

```ts
Object.entries(addressFirstSeenMonth).forEach(([addr, firstMonth]) => {
  for (let m = firstMonth + 1; m < 12; m++) {
    if (addressCountByMonth[m][addr] > 0) { recurringAddresses.add(addr); break; }
  }
});
```

It never touches `recurring_bookings` at all. So:

| | measures |
|---|---|
| `PnLOverview.totalRecurringClients` | unique **addresses that actually came back** — observed retention |
| `ReportsPage.recurringClients` | **rows in `recurring_bookings`**, active *and* paused — configured intent |

Those can differ wildly in both directions: a customer on a paused schedule who never
rebooked counts in one and not the other; a loyal customer with no configured schedule
counts in the other and not the one.

**And the number is now inconsistent with its own subtitle.** `:1085` renders
`{fmt(actuals.totalRecurringRevenue)} revenue` directly beneath — revenue derived from
the *address* population, under a count derived from the *rows* population. The card
shows a numerator and a denominator from two different datasets.

`retentionRate` (`:429`) also divides `recurringAddresses.size` by `uniqueAddresses.size`
— that one is internally consistent and is **not** affected by the override, so retention
percentage remains trustworthy even while the count beside it is not.

**Not affected:** `CustomersDuplicatesPage:406` counts rows only to build the unmerge
snapshot, which is correct. `features.ts` uses `recurring_bookings` as a plan-gating
feature key, not a count.

---

## The queries

**1. Are the duplicates same-address or different-address?** This is the one that
decides whether you have a display question or a data problem.

```sql
select c.first_name || ' ' || c.last_name          as customer,
       count(*)                                     as series,
       count(distinct lower(trim(coalesce(r.address,'')))) as distinct_addresses,
       count(*) filter (where r.is_active)          as active_series,
       string_agg(distinct coalesce(r.address,'(no address)'), ' | ') as addresses
from public.recurring_bookings r
join public.customers c on c.id = r.customer_id
where r.organization_id = '<YOUR_ORG_ID>'
group by c.id, c.first_name, c.last_name
having count(*) > 1
order by count(*) desc;
```

`series > distinct_addresses` is the data problem — the same customer at the same
address more than once. `series = distinct_addresses` is legitimate multi-property.

**2. The three candidate numbers, side by side**

```sql
select
  (select count(*) from public.recurring_bookings
     where organization_id = '<ORG>')                             as rows_total,
  (select count(*) from public.recurring_bookings
     where organization_id = '<ORG>' and is_active)               as rows_active,
  (select count(distinct customer_id) from public.recurring_bookings
     where organization_id = '<ORG>' and is_active)               as distinct_customers_active,
  (select count(distinct (customer_id, lower(trim(coalesce(address,'')))))
     from public.recurring_bookings
     where organization_id = '<ORG>' and is_active)               as distinct_customer_addresses_active;
```

The gap between columns 2 and 4 is the exact size of the inflation.

**3. Exact duplicates — same customer, same address, both active**

```sql
select customer_id, lower(trim(coalesce(address,''))) as addr,
       count(*) as copies,
       array_agg(id order by created_at) as ids,
       array_agg(created_at order by created_at) as created
from public.recurring_bookings
where organization_id = '<ORG>' and is_active
group by 1,2
having count(*) > 1;
```

The `created` timestamps tell you whether these were double-submits (seconds apart) or
deliberate re-creations (days apart) — which changes whether the fix is a guard or a
cleanup.

**4. Confirm no unique constraint exists live** (rule 4b — the migration list above is a
hypothesis)

```sql
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.recurring_bookings'::regclass
order by contype, conname;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'recurring_bookings';
```

---

## What this is, in your terms

**Both — and they are separable.**

**A display question**, regardless of what the data says: `PnLOverview`'s two cards say
"Recurring Clients" and are handed a plan count that overrides a deduplicated one. That
is wrong even if every row in the table is legitimate, because a customer with two
properties would still make the card overstate clients. Fixing it needs no data cleanup
— only deciding what the cards should mean, and either passing the right number or
letting the existing fallback stand.

**A data problem, only if query 1 shows `series > distinct_addresses`.** If every
duplicate is a different address, there are no bad rows — the tab is counting schedules
correctly and only the label invites misreading.

My read on what the numbers should be, for you to accept or reject:

- Recurring tab → keep counting **rows**, and say so in the tile as the header already
  does. "30 schedules" is the operationally useful number when you are managing schedules.
- Reports "Recurring Plans" → keep as rows, but **add the `is_active` filter**; counting
  paused schedules as plans is hard to defend.
- P&L "Recurring Clients" → **distinct customers**, or stop overriding and let
  `PnLOverview`'s own address-based figure stand. Either is defensible; passing a row
  count is not.


---

## What was done — 2026-07-30

All three display decisions taken and shipped. The data question was deliberately
separated out.

1. **Recurring tab tile relabelled "Total" → "Schedules".** Still a row count, which is
   the right number for managing schedules; it just no longer invites reading as a
   customer count. The page subtitle already said "recurring schedules".
2. **Reports "Recurring Plans" now filters `is_active`.** It was counting every row ever
   created, so it read higher than the tab it was meant to agree with.
3. **P&L stopped receiving the row count.** `recurringStats` is no longer passed to
   `PnLOverview`, and since it fed nothing else, the prop and its interface were removed
   — `recurringCleans` and `recurringRevenue` were hardcoded `0` and read by nothing.
   Both "Recurring Clients" cards now use `actuals.totalRecurringClients`, the
   deduplicated figure the component already computed, which also restores agreement
   with the revenue rendered directly beneath it.

**One extra, unasked but in the same class:** `ReportsPage`'s state field was named
`recurringClients` while holding a plan count. That naming is *how* a row count ended up
in a card labelled "Clients" in the first place. Renamed to `recurringPlans`, and the two
always-zero sibling fields dropped with it.

`tsc` clean; eslint unchanged on all three files (29/18/18 before and after).
