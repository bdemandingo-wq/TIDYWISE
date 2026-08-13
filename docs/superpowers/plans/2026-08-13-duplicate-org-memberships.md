# An account can hold two `org_memberships` rows for the same org, with different roles

**Logged:** 2026-08-13, found while diagnosing why a test token could not see a seeded invoice.
**Status:** Not fixed. Not investigated beyond the observation.
**Severity:** Unknown, and that is the point — it depends on whether any role check reads the first matching row.

## The observation

The QA owner account (`support+qa2@tidywisecleaning.com`, auth id `cb627101-…`) holds **two** membership rows for the **same** organisation:

```
organization_id                        role    created_at
e4d60558-af69-45d2-97cf-cdea4c68a411   owner   2026-08-13T05:45:14.968Z
e4d60558-af69-45d2-97cf-cdea4c68a411   member  2026-08-13T05:50:34.528Z
```

Same org, two roles, created five minutes apart. The `owner` row came first — presumably from creating the org — and the `member` row was added afterwards by whatever action happened at 05:50.

`public.org_memberships` evidently has no unique constraint on `(organization_id, user_id)`. Per CLAUDE.md rule 4b, do not take that from the migration files either way — check `pg_constraint` on the live table before concluding.

## Why it might matter

The risk is any code that resolves a user's role by taking the first matching membership row. If such a check exists and PostgreSQL returns the `member` row first — row order without `ORDER BY` is not guaranteed, and can change after an UPDATE or VACUUM — then an **org owner would be treated as a member**.

The visible effect would be intermittent: an owner occasionally losing access to owner-only surfaces, with no error and nothing in the logs. That is a hard bug to report and a harder one to reproduce.

Whether it is real depends entirely on how the role helpers are written. `is_org_owner`, `is_org_admin`, `is_org_operator`, `has_org_financial_access` and `get_user_organization_id` all exist and all resolve a role from this table. Two shapes to look for:

- `SELECT role FROM org_memberships WHERE ... LIMIT 1` — **vulnerable**, order-dependent.
- `EXISTS (SELECT 1 FROM org_memberships WHERE ... AND role = 'owner')` — **safe**, a duplicate lower-privilege row cannot mask the higher one.

The second form is the more natural way to write these, so this may well be harmless in practice. It has not been checked.

## Checks to run

```sql
-- 1. Is this one account or a pattern? Any user with >1 row per org.
select user_id, organization_id, count(*), array_agg(role order by created_at)
from public.org_memberships
group by 1, 2 having count(*) > 1
order by 3 desc;

-- 2. Is there anything stopping it?
select conname, contype, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.org_memberships'::regclass;

-- 3. Do the role helpers read a first match, or use EXISTS?
select proname, pg_get_functiondef(oid)
from pg_proc
where proname in ('is_org_owner','is_org_admin','is_org_operator',
                  'has_org_financial_access','get_user_organization_id');
```

Query 1 first. If this is one QA account and no real customer, it is a curiosity. If paying orgs have duplicates, query 3 decides whether it is a live access bug.

## Where the duplicate came from

Unknown, and worth pinning down before adding a constraint — a unique index would start failing whatever code path creates the second row.

Two candidates, both from prior work in this repo: the `org_memberships` INSERT policy that Lovable replaced on its own during an unrelated publish (see follow-up item on `project-tidywise-saas-infra`), and `OnboardingPage.tsx`'s create-org flow, which inserts the `organizations` row and then the membership. A second membership appearing five minutes after the first looks more like a second deliberate action — an invite accepted, a role changed by adding rather than updating — than a race in org creation.

## Already mitigated in the test harness

`tests/global-setup.ts` no longer takes `memberships[0]`. It now:

- **errors** when an account's memberships span more than one distinct org, rather than guessing which is "the" org;
- resolves duplicates for the same org by **role privilege** (`owner` > `admin` > `manager` > `member`), so the derived context is deterministic regardless of row order;
- **warns** when it finds more than one row, naming the roles it saw.

Live output:

```
[setup] owner has 2 membership rows for org e4d60558-… (roles: owner, member).
Using the most privileged, "owner". Duplicate memberships can confuse any
is_org_admin-style check that reads the first match.
```

That makes the test harness immune to it, and surfaces the condition on every setup run. It does nothing about the application code, which is the part that might actually matter.
