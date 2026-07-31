# Lovable prompt — merge_customers should return the portal row IDs, not just counts

**Status:** not yet run. **LOW priority** — the frontend now works for owners without it.
**Why it exists:** `merge_customers` returns `portal_moved` / `portal_deactivated` as
integer counters, but `unmerge_customers` looks the row up by **id**
(`snapshot->>'portal_user_moved_id'`). The frontend bridges that gap by predicting the
id from pre-merge queries — which works, except for managers.

---

## The gap this closes

`merge_customers` (`20260731125520…sql:97,104`) does:

```sql
GET DIAGNOSTICS portal_deactivated = ROW_COUNT;   -- an INT
GET DIAGNOSTICS portal_moved       = ROW_COUNT;   -- an INT
```

and returns those counts. `unmerge_customers` (`:248-259`) needs ids:

```sql
WHERE id = (snapshot->>'portal_user_moved_id')::uuid;
```

`CustomersDuplicatesPage` now closes that by querying `client_portal_users` for both
customers **before** the merge and mirroring the RPC's branch, which is deterministic
on exactly those two facts. It also cross-checks its prediction against the returned
counters and warns when they disagree.

**Where the prediction fails: managers.**

| | predicate | effective |
|---|---|---|
| `merge_customers` caller check | `is_org_admin` → `role IN ('owner','admin','manager')` | **owner or manager** |
| `client_portal_users` RLS | `role = ANY(ARRAY['admin','owner'])` | **owner only** (`'admin'` retired 2026-07-10) |

So a manager may merge but cannot read `client_portal_users`. Both pre-merge queries
return nothing, the snapshot records no portal id, and the RPC still moves the login.
The frontend detects this and warns, but Undo genuinely cannot restore the login.

Returning the ids from the RPC removes the prediction entirely. `merge_customers` is
`SECURITY DEFINER`, so it sees the rows regardless of the caller's role.

---

## The prompt

````
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: public.merge_customers currently reports what it did to the customer's
portal login as two integer counters:

  GET DIAGNOSTICS portal_deactivated = ROW_COUNT;
  GET DIAGNOSTICS portal_moved       = ROW_COUNT;
  … 'portal_moved', portal_moved, 'portal_deactivated', portal_deactivated

But public.unmerge_customers reverses it by ID, reading
snapshot->>'portal_user_moved_id' and snapshot->>'portal_user_deactivated_id'.
A count cannot be turned back into an id, so the frontend currently predicts the
id by querying client_portal_users before the merge.

That prediction fails for managers. merge_customers requires is_org_admin, which
is role IN ('owner','admin','manager'), but the RLS policy on client_portal_users
is role = ANY(ARRAY['admin','owner']) — and 'admin' matches no rows since it was
retired on 2026-07-10. So a manager can merge but cannot read that table: the
snapshot records no id, and Undo cannot restore the login.

FIX: capture and return the row IDs alongside the counters.

merge_customers is SECURITY DEFINER, so it can see the rows whatever the caller's
role — which is exactly why the id belongs in its return value rather than being
guessed at by the client.

Declare two more variables beside portal_moved / portal_deactivated:

  portal_moved_id        UUID := NULL;
  portal_deactivated_id  UUID := NULL;

Then use RETURNING to capture the id in each branch. UNIQUE (customer_id) on
client_portal_users guarantees at most one row, so INTO a scalar is safe:

  IF EXISTS (SELECT 1 FROM public.client_portal_users
             WHERE customer_id = primary_id) THEN
    UPDATE public.client_portal_users
    SET is_active = false, updated_at = now()
    WHERE customer_id = secondary_id
    RETURNING id INTO portal_deactivated_id;
    GET DIAGNOSTICS portal_deactivated = ROW_COUNT;
  ELSE
    UPDATE public.client_portal_users
    SET customer_id = primary_id, updated_at = now()
    WHERE customer_id = secondary_id
    RETURNING id INTO portal_moved_id;
    GET DIAGNOSTICS portal_moved = ROW_COUNT;
  END IF;

And add both to the returned jsonb_build_object, KEEPING the existing counters so
nothing that reads them breaks:

  'portal_moved',           portal_moved,
  'portal_deactivated',     portal_deactivated,
  'portal_moved_id',        portal_moved_id,
  'portal_deactivated_id',  portal_deactivated_id

Change NOTHING else — not the branch logic, not the org check, not the
caller-is-admin check, not unmerge_customers, and not the REVOKE/GRANT lines.

NOT IN SCOPE, please do not do it: widening the client_portal_users RLS policy so
managers can read it. That is a separate access-control decision about whether
managers should see portal logins at all, and it should not be made as a side
effect of a merge bug.

AFTERWARDS please paste:

  select pg_get_functiondef('public.merge_customers(uuid,uuid)'::regprocedure);

Confirm the migration RAN, not just that a file was created.
````

---

## The frontend change that follows

Once this is deployed, `CustomersDuplicatesPage` should prefer the returned ids over
its prediction:

```ts
portal_user_moved_id: portalResult?.portal_moved_id ?? predictedMovedId,
portal_user_deactivated_id: portalResult?.portal_deactivated_id ?? predictedDeactivatedId,
```

Keeping the prediction as a fallback means the snapshot still works if this migration
is ever rolled back, and the `snapshotIncomplete` cross-check can then only fire if
both sources fail — which would be a real bug rather than a permissions artefact.

**Deliberately not written yet**, because the snapshot is assembled before the RPC
returns and would need restructuring to use the response — a change worth making once,
against a deployed function, rather than guessing at the shape now.
