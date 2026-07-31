# Queued decision — two different definitions of "platform admin"

**Status:** flagged, NOT changed. This is an access decision, not a cleanup.
**Raised:** 2026-07-31, while removing the per-render logging from `PlatformAdminRoute`.

---

## Correction to how this was described

The concern was that `is_platform_admin` hardcodes the role `'admin'`, which the
role model has moved away from. That isn't quite where the hardcode is.

`is_platform_admin()` does not mention roles at all. Its only definition —
`20260509165919_ad38301f…sql`, and it is the only one in the repo — gates on **two
hardcoded email addresses**:

```sql
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) IN ('support@tidywisecleaning.com','agencyfootprintllc@gmail.com')
  )
$$;
```

The `'admin'` hardcode is in the **frontend route**, `PlatformAdminRoute.tsx:68`:

```ts
.eq("organization_id", PLATFORM_ORG_ID)   // hardcoded UUID at :7
.in("role", ["owner", "admin"])
```

**Per CLAUDE.md rule 4b, the migration is a hypothesis about live state.** The
deployed function body has not been verified against the database, and there is no
migration that alters it. If the live body differs from the above, this whole note
needs revisiting before anything is decided.

## The actual problem: the two gates can disagree

They are different predicates over different data, and nothing keeps them in step.

| | `is_platform_admin()` | `PlatformAdminRoute` |
|---|---|---|
| **Gates on** | email address in `auth.users` | membership row in `org_memberships` |
| **Source of truth** | two literals in a function body | role ∈ (owner, admin) of one hardcoded org UUID |
| **Protects** | RLS on `billing_events`, `billing_backfill_jobs`, `account_deletion_requests`, and both billing views via `security_invoker` | which routes render |

So a person can pass one and fail the other, in both directions:

- **Owner/admin of the platform org whose email is not one of the two** — the route
  renders the revenue page, then every query behind it returns zero rows. The page
  does not error; it shows a working-looking dashboard reporting no revenue. That
  is exactly the failure shape the revenue page was built to avoid, arriving by a
  different door.
- **Either of the two emails without a platform-org membership row** — bounced from
  the route, but retains full read access through PostgREST and any RPC.

The second is the one that actually matters for access: **the route is not the
security boundary, the RLS predicate is.** Changing `PlatformAdminRoute` alone would
change nothing about who can read billing data.

## Why this isn't being changed now

Picking a single predicate is a decision about who should have platform-level access
to every org's revenue, and there are at least three defensible answers:

1. **Membership-based** — `is_platform_admin()` reads `org_memberships` for the
   platform org, matching the route. Manageable through the UI, but it means anyone
   who can add a platform-org membership can grant themselves access to all billing
   data. Worth checking who can currently write that table before choosing this.
2. **Keep emails, fix the route** — make the route call `is_platform_admin()` so both
   agree, accepting that adding an admin means a migration. Smallest blast radius;
   most annoying operationally.
3. **A dedicated flag** — e.g. `profiles.is_platform_admin`, with its own write
   policy. Cleanest, most work, and needs a backfill.

All three are one migration. None should be picked without deciding the first
question in option 1.

## What was done instead, today

Only the logging: `PlatformAdminRoute` was writing `email` and `role` to the console
on **every render**, in production. That's gone. A single `console.warn` on the
denial path remains, carrying `userId` and `role` but not the email — matching the
existing pattern at `AdminRoute.tsx:189`, and kept so a denied attempt is not
completely silent.

That change is deliberately behaviour-preserving. It does not touch either predicate.
