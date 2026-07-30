# Lovable prompt — role predicate sweep

**Status:** not yet run. Send **after** `2026-07-30-revert-financial-access-widening.md` has deployed (it has, 2026-07-30).
**Target:** main project `slwfkaqczvwvvvavkgpr`

## Why

`'admin'` was retired from `org_memberships` on 2026-07-10 (`20260710040933`: *"Migrate any existing 'admin' org memberships to 'manager'"*), and `is_org_admin` was widened the same day to recognise `'manager'` (`20260710050911`). But **only the helper functions were updated** — policies with an *inline* `role IN ('owner','admin')` predicate were not. Since `'admin'` now matches nothing, those policies silently became **owner-only**, and managers lost access nobody decided to remove.

Four such policies were still being authored *after* the retirement (`20260716180000`, `20260721111048`, `20260723025627`, `20260723101945`), so this is an ongoing pattern, not a one-off residue.

## Scope — settled

**13 tables to widen** from inline `('owner','admin')` to `is_org_admin(organization_id)`:

`admin_booking_request_notifications`, `automation_definitions`, `automation_steps`, `automation_triggers`, `client_booking_requests`, `client_notifications`, `client_portal_feedback`, `client_portal_users`, `client_tier_settings`, `custom_frequencies`, `loyalty_transactions`, `onboarding_progress`, `working_hours`

**Exception 1 — `staff_documents` stays owner-only.** Personal HR material about employees. A manager reading another staff member's documents is a different question from managing schedules, and it gets decided on its own, not in a sweep.

**Exception 2 — `stripe_subscriptions` becomes owner-only explicitly**, not via `has_org_financial_access`. That predicate's meaning changed twice today; platform billing is the owner's own payment method, not business finance, and it should not inherit from a function whose scope is contested.

**Out of scope:**
- `booking_team_assignments` — its policies are `is_org_member`, and the Staff Portal reads it (`StaffPortal.tsx:277,326`, `CleanerEarnings.tsx:108,195`). Narrowing would stop cleaners seeing their own assignments and earnings.
- `product_tour_events` — no admin predicate to normalise.
- `demo_bookings`, `demo_requests`, `site_content` — platform `app_role`, a different system.

**Also: retire `is_org_operator`.** It is now identical in effect to `is_org_admin` (both `owner|admin|manager`, effectively `owner|manager`), has two call sites — both inside `DO` loops — and zero TypeScript references. Two names for one predicate is how the next person picks the wrong one.

## Why this is explicit and not a loop

A `DO` loop over a table array is precisely what caused today's incident: `20260709144431:83-104` applied one policy to eleven tables, so widening the shared function leaked payroll, expenses, disputes, Stripe config and the member directory. **This sweep names every policy it changes, and reports before it changes anything.**

Several of these tables also carry sibling policies that must survive untouched — `working_hours` has a `"Staff can manage own working hours"` self-service policy alongside its admin one, and `client_tier_settings` has an `is_org_member` SELECT. So this is per-**policy**, not per-table.

## The prompt

```
Please do this in TWO phases on the main project. Phase 1 changes nothing.

BACKGROUND: 'admin' was retired from org_memberships on 2026-07-10 and migrated
to 'manager'. is_org_admin was widened the same day to include 'manager', but
policies with an INLINE role IN ('owner','admin') predicate were never updated.
Because 'admin' now matches no rows, those policies are silently owner-only and
managers lost access nobody intended to remove. This sweep fixes that.

Do NOT use a DO loop over a table array. One such loop (20260709144431:83-104)
applied a single policy to eleven tables, and widening its shared function today
leaked payroll, expenses, disputes, Stripe config and the member directory. Name
every policy you change.

=========================================================
PHASE 1 — REPORT ONLY. Change nothing. Paste the output.
=========================================================

-- 1a. Every policy on the sweep tables whose predicate names 'admin' inline.
select tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'admin_booking_request_notifications','automation_definitions',
    'automation_steps','automation_triggers','client_booking_requests',
    'client_notifications','client_portal_feedback','client_portal_users',
    'client_tier_settings','custom_frequencies','loyalty_transactions',
    'onboarding_progress','working_hours'
  )
  and (qual ilike '%''admin''%' or with_check ilike '%''admin''%')
  and coalesce(qual,'') || coalesce(with_check,'') not ilike '%is_org_admin%'
order by tablename, policyname;

-- 1b. SIBLING policies on those same tables — these must survive untouched.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'admin_booking_request_notifications','automation_definitions',
    'automation_steps','automation_triggers','client_booking_requests',
    'client_notifications','client_portal_feedback','client_portal_users',
    'client_tier_settings','custom_frequencies','loyalty_transactions',
    'onboarding_progress','working_hours'
  )
  and not (coalesce(qual,'') || coalesce(with_check,'') ilike '%''admin''%')
order by tablename, policyname;

-- 1c. Live policies still referencing is_org_operator (created by DO loops, so
--     their names are not in any migration file).
select tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (qual ilike '%is_org_operator%' or with_check ilike '%is_org_operator%')
order by tablename, policyname;

-- 1d. stripe_subscriptions and staff_documents as they stand now.
select tablename, policyname, cmd, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('stripe_subscriptions','staff_documents')
order by tablename, policyname;

STOP after Phase 1 and show me those four result sets. Do not proceed to Phase 2
in the same reply.

=========================================================
PHASE 2 — APPLY, after I have reviewed Phase 1
=========================================================

STEP A — For EACH policy returned by query 1a, drop it and recreate it
identically except that the inline role predicate becomes
public.is_org_admin(organization_id).

Preserve exactly: the policy NAME, the cmd (SELECT/INSERT/UPDATE/DELETE/ALL),
the roles clause (TO authenticated / TO public), whether it is PERMISSIVE or
RESTRICTIVE, and whether it had a WITH CHECK. If a policy had both USING and
WITH CHECK, the replacement must have both.

Shape, per policy:

  DROP POLICY IF EXISTS "<exact existing name>" ON public.<table>;
  CREATE POLICY "<exact existing name>"
  ON public.<table>
  FOR <same cmd>
  TO <same roles>
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));   -- only if it had one

Do NOT touch any policy returned by query 1b. Those are member-level reads and
staff self-service policies — working_hours has "Staff can manage own working
hours", client_tier_settings has an is_org_member SELECT — and they are correct
as they are.

STEP B — staff_documents: change NOTHING. Add only a comment recording the
decision, so the next sweep does not pick it up:

  COMMENT ON TABLE public.staff_documents IS
    'OWNER-ONLY BY DECISION (2026-07-30). Deliberately excluded from the
     is_org_admin role sweep. Holds personal HR material about employees; a
     manager reading another staff member''s documents is a separate decision
     from managing schedules and must not be changed as part of a sweep.';

STEP C — stripe_subscriptions: make owner-only EXPLICIT.

Its current predicate names the literal 'admin', which matches nothing, so it is
already owner-only in effect. State that intent directly rather than leaving it
resting on a dead value, and do NOT route it through
has_org_financial_access — that function's meaning changed twice today and this
is the owner's own platform billing, not business finance.

For each policy on stripe_subscriptions from query 1d that names 'admin' inline,
replace its predicate with an explicit owner check:

  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = stripe_subscriptions.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  )

Keep the policy name, cmd, roles and RESTRICTIVE/PERMISSIVE as they are.

Then record why:

  COMMENT ON TABLE public.stripe_subscriptions IS
    'OWNER-ONLY, stated explicitly (2026-07-30). This is the organisation
     owner''s own platform billing, not business finance. Deliberately NOT gated
     via has_org_financial_access(): that function is shared by an eleven-table
     DO-loop policy and its role set changed twice on 2026-07-30. Do not
     re-point this at a shared predicate.';

STEP D — retire is_org_operator.

For each policy returned by query 1c, recreate it with
public.is_org_admin(organization_id) in place of is_org_operator, preserving
name, cmd, roles, permissive/restrictive and WITH CHECK exactly as in Step A.

Then, ONLY once query 1c returns no rows:

  DROP FUNCTION IF EXISTS public.is_org_operator(uuid);

is_org_admin and is_org_operator are currently identical — both
role IN ('owner','admin','manager') — so this is a rename, not a behaviour
change. is_org_operator has zero TypeScript references.

If dropping the function errors because something still depends on it, STOP and
tell me what — do not force it with CASCADE.

=========================================================
AFTERWARDS — paste these
=========================================================

-- No inline 'admin' left on the swept tables (expect zero rows)
select tablename, policyname, cmd, qual
from pg_policies
where schemaname='public'
  and (qual ilike '%''admin''%' or with_check ilike '%''admin''%')
  and coalesce(qual,'') || coalesce(with_check,'') not ilike '%is_org_admin%'
order by tablename, policyname;

-- is_org_operator fully gone (expect zero rows, then the function absent)
select tablename, policyname from pg_policies
where schemaname='public'
  and (qual ilike '%is_org_operator%' or with_check ilike '%is_org_operator%');

select count(*) as is_org_operator_still_exists
from pg_proc where proname = 'is_org_operator';

-- Sanity: the swept tables' sibling policies still exist
select tablename, count(*) as policy_count
from pg_policies where schemaname='public'
  and tablename in ('working_hours','client_tier_settings','loyalty_transactions')
group by tablename order by tablename;

Confirm the migration RAN, not just that a file was created.
```

## What to check in the Phase 1 output before approving

- **Query 1a should return roughly 14 rows across 13 tables.** One table has two matching policies (that is the 16-names-vs-17-policies discrepancy). If it returns far more, something is in scope that should not be.
- **Query 1b is the safety net.** Confirm `working_hours` shows `"Staff can manage own working hours"` and `client_tier_settings` shows an `is_org_member` SELECT. If either is missing from 1b and present in 1a, stop — the pattern match is too broad.
- **Query 1c tells you how many tables `is_org_operator` actually touched.** The migrations only show two dynamic call sites; the live count could be higher, because one of them was a loop.
- **Query 1d** shows whether `stripe_subscriptions` still carries the DO-loop `"Financial: owner+admin only"` policy alongside its literal-`'admin'` one. After this morning's revert both should be owner-only, so Step C is hygiene rather than a behaviour change — but confirm rather than assume.

## Expected outcome

- 13 tables: managers regain access they lost silently on 2026-07-10
- `staff_documents`: unchanged, owner-only, with the reason recorded on the table
- `stripe_subscriptions`: owner-only stated explicitly, not inherited
- `is_org_operator`: gone; `is_org_admin` is the single operational predicate
- Staff self-service and member-read policies: untouched
