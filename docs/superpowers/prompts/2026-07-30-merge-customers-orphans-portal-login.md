# Lovable prompt — merge_customers orphans the customer's portal login

**Status:** not yet run.
**Found:** 2026-07-30 backlog investigation.
**Premises re-verified 2026-07-31**, after Lovable ran several migrations: neither
`client_portal_users` nor `merge_customers` was touched by any of them, the
`UNIQUE (customer_id)` constraint is still the latest word on that table, and the current
`merge_customers` definition still contains zero references to `client_portal_users`.
**Severity:** MEDIUM — silent, customer-facing, and self-inflicted by an admin action.

---

## The symptom is NOT "they can't sign in"

Worth correcting up front, because it changes the priority: **the customer signs in
perfectly well and then sees an empty account.**

`client-portal-login/index.ts:71-95` validates the password via
`validate_client_portal_login`, loads the `client_portal_users` row, checks
`is_active`, and mints a session carrying that row's `customer_id`. It **never
joins `customers`** and nothing anywhere in the portal filters `merged_into` —
verified by grep across `supabase/functions/` and `src/`, which finds it used only
in `useBookings.ts:505`, `CustomersDuplicatesPage.tsx:195` and
`CRMSuggestionsPanel.tsx:108`, all admin-side.

So login succeeds against the **secondary** (merged-away) customer id. Every portal
read is scoped to that id, and `merge_customers` has already moved the bookings,
recurring bookings, quotes, locations, property notes, referrals and loyalty to the
primary. Result: correct password, working session, zero bookings, no history, no
tier. Nothing tells them why, and nothing tells the org either.

A hard login failure would at least generate a support call. This generates a
customer who thinks their history was deleted.

## Why it happens

`merge_customers` (latest definition `20260506223530…sql:50-155`) repoints exactly
seven things:

```
bookings, recurring_bookings, quotes, locations,
referrals (referrer_customer_id AND referred_customer_id),
customer_loyalty, property_notes
```

`client_portal_users` is not among them.

The merge is **soft** — `:153` sets `merged_into = primary_id` and leaves the row
in place. So the `ON DELETE CASCADE` on `client_portal_users_customer_id_fkey`
(`20260716180000…sql:56-60`) never fires either. The portal row simply keeps
pointing at a customer that is no longer the real one.

## The constraint that makes this non-trivial

`20260716180000…sql:62-65`:

```sql
ALTER TABLE public.client_portal_users
  ADD CONSTRAINT client_portal_users_customer_id_key UNIQUE (customer_id);
```

**One portal login per customer.** So the obvious one-liner —

```sql
UPDATE public.client_portal_users SET customer_id = primary_id
WHERE customer_id = secondary_id;
```

— raises `23505` whenever the primary *also* has a portal login, which aborts the
entire merge transaction. Merging two customers who both had portal accounts would
start failing outright. That must not happen.

Three cases have to be handled:

| Secondary has login | Primary has login | Correct action |
|---|---|---|
| yes | no | repoint to primary |
| no | any | nothing to do |
| yes | **yes** | keep primary's; deactivate the secondary's |

The both-have-one case must **not delete credentials** — deactivating is
reversible and preserves the audit trail.

---

## The prompt

```
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: public.merge_customers(primary_id, secondary_id) repoints bookings,
recurring_bookings, quotes, locations, referrals, customer_loyalty and
property_notes from the secondary customer to the primary. It does NOT repoint
public.client_portal_users.

The merge is soft (it sets customers.merged_into rather than deleting), so the
ON DELETE CASCADE never fires and the portal login row keeps pointing at the
merged-away customer. Nothing in the portal filters merged_into, so the customer
still logs in successfully and sees a completely empty account — no bookings, no
history, no loyalty tier — because all of it now belongs to the primary id.

IMPORTANT CONSTRAINT: client_portal_users has UNIQUE (customer_id). A blind
UPDATE would raise 23505 whenever BOTH customers have a portal login, which
would abort the whole merge. Please handle all three cases.

FIX: inside merge_customers, after the existing repointing block and BEFORE the
final "UPDATE public.customers SET merged_into" statement, add:

  IF to_regclass('public.client_portal_users') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.client_portal_users
               WHERE customer_id = secondary_id) THEN

      IF EXISTS (SELECT 1 FROM public.client_portal_users
                 WHERE customer_id = primary_id) THEN
        -- Both have a login. Keep the primary's and disable the duplicate
        -- rather than deleting it, so the change is reversible and auditable.
        UPDATE public.client_portal_users
        SET is_active = false, updated_at = now()
        WHERE customer_id = secondary_id;
        GET DIAGNOSTICS portal_deactivated = ROW_COUNT;
      ELSE
        -- Only the secondary has a login: it IS this customer's login, so move
        -- it to the surviving record.
        UPDATE public.client_portal_users
        SET customer_id = primary_id, updated_at = now()
        WHERE customer_id = secondary_id;
        GET DIAGNOSTICS portal_moved = ROW_COUNT;
      END IF;

    END IF;
  END IF;

Declare portal_moved INT := 0 and portal_deactivated INT := 0 alongside the
existing bookings_moved / quotes_moved counters, and add both to the returned
jsonb_build_object so the UI can report what happened:

  'portal_moved', portal_moved,
  'portal_deactivated', portal_deactivated

Keep everything else identical — the org check, the caller-is-admin check, the
field-merge COALESCE block, and the REVOKE/GRANT lines.

SECOND CHANGE — public.unmerge_customers(primary_id, secondary_id, snapshot).

It must undo the above, or unmerging leaves the login on the wrong customer.
Please add handling that reads two optional keys from the snapshot JSONB:

  snapshot->>'portal_user_moved_id'         (uuid, or absent)
  snapshot->>'portal_user_deactivated_id'   (uuid, or absent)

If portal_user_moved_id is present, set that row's customer_id back to
secondary_id. If portal_user_deactivated_id is present, set that row's
is_active back to true. Both must be no-ops when the key is absent, so older
snapshots taken before this change keep working.

Use exactly those two key names — the frontend will be updated to write them and
the names need to match.

AFTERWARDS please paste the damage report — portal logins already orphaned by
merges that have already happened, which this fix does NOT repair:

  select cpu.id            as portal_user_id,
         cpu.username,
         cpu.is_active,
         cpu.customer_id   as points_at_merged_customer,
         c.merged_into     as should_point_at,
         o.name            as organization,
         cpu.last_login_at
  from public.client_portal_users cpu
  join public.customers c     on c.id = cpu.customer_id
  join public.organizations o on o.id = c.organization_id
  where c.merged_into is not null
  order by cpu.last_login_at desc nulls last;

  -- of those, how many would collide if repointed
  select count(*) as would_collide
  from public.client_portal_users cpu
  join public.customers c on c.id = cpu.customer_id
  where c.merged_into is not null
    and exists (select 1 from public.client_portal_users p
                where p.customer_id = c.merged_into);

Do NOT repair those rows yet — show me the list first. A last_login_at after the
merge date means a real customer has already sat looking at an empty portal.

Confirm the migration RAN, not just that a file was created.
```

---

## The src/ side — yes, there is one

`CustomersDuplicatesPage.tsx:423-430` builds the `snapshot` that `unmerge_customers`
replays. It captures booking, recurring, quote, location, property-note and referral
ids. **There is no portal entry**, so once the RPC starts moving portal logins,
unmerge cannot put them back.

Once the migration above is deployed, `snapshot` needs:

```ts
portal_user_moved_id: <id of the row whose customer_id was moved, or null>,
portal_user_deactivated_id: <id of the row that was deactivated, or null>,
```

Deliberately **not shipped yet.** The snapshot is built client-side *before* the
RPC runs, so the frontend cannot know which of the two branches the function took —
the values have to come back from `merge_customers`'s return payload, which is
exactly why the prompt adds `portal_moved` / `portal_deactivated` to it. Writing the
client half before the RPC exists would mean guessing at a response shape that
isn't live yet, and this repo has been bitten by exactly that (the `update_location`
body-key mismatch, 2026-07-30).

**Do this after the migration is confirmed deployed**, reading the real return
payload rather than an assumed one.

## Also worth knowing

Existing portal sessions carry `customer_id` inside the signed token
(`client-portal-login/index.ts:97-101` → `mintPortalSession`). Fixing the merge does
not fix a session already minted against the orphaned id — that customer stays
looking at an empty portal until their token expires and they sign in again. Not
worth special handling, but it means "fixed" and "fixed for everyone currently
logged in" are different moments.
