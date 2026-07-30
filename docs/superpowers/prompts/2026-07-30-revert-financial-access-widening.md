# Lovable prompt — revert the financial-access widening (PRIORITY)

**Status:** not yet run. **Send this before anything else.**
**Target:** main project `slwfkaqczvwvvvavkgpr`
**Reverts:** part 1 of `20260730034956` (today)

## What went wrong

`20260730034956` widened `has_org_financial_access` to `role IN ('owner','manager')` on the assumption that `invoices` was its only caller. It is not. `20260709144431:83-104` applies a `"Financial: owner+admin only"` policy to **eleven tables** through a `DO` loop:

```
invoices, invoice_items, payroll_payments, payroll_settings, payroll_audit_log,
stripe_subscriptions, org_stripe_settings, manual_payments, expenses, tips, disputes
```

Plus two more surfaces:
- `organization_invites` — `"Admins view invites"` SELECT (`20260709144431:136`)
- **`list_org_members(uuid)`** (`20260709144431:229`) — a `SECURITY DEFINER` function returning `auth.users.email`, name and role for **every member**, granted to `authenticated`

So the widening gave managers payroll payouts, payroll audit history, expenses, disputes, Stripe configuration, platform billing, and the full member directory with email addresses.

## The correct shape

The manager grant belonged at the two tables that needed it, not in a predicate eleven tables depend on. So: **narrow the function back to owner-only, and grant managers explicitly at `invoices` and `invoice_items`.**

Narrowing also restores owner-only on the other nine tables, `organization_invites` and `list_org_members` without touching them — that is the point of reverting the function rather than patching each table.

The explicit grant is written **inline** rather than as a new helper, deliberately. A shared predicate is exactly what failed here, and a function named `has_invoice_access` would eventually be reused for quotes or payments by someone reasoning that they are invoice-ish. Inline duplication across two tables is the cheaper mistake. The codebase already uses inline `org_memberships` predicates in 33 places, so the pattern is established and works against that table's RLS.

## The prompt

```
Please run a migration on the main project. It reverts part of today's
20260730034956 and must go out before any other role-related change.

WHY: that migration widened has_org_financial_access to ('owner','manager') on
the assumption invoices was its only caller. It is not. Migration
20260709144431:83-104 applies a "Financial: owner+admin only" policy to ELEVEN
tables via a DO loop — invoices, invoice_items, payroll_payments,
payroll_settings, payroll_audit_log, stripe_subscriptions, org_stripe_settings,
manual_payments, expenses, tips, disputes — and the same function also gates
organization_invites ("Admins view invites") and the list_org_members(uuid)
function, which returns every member's email, name and role.

So managers currently have read access to payroll payouts, payroll audit history,
expenses, disputes, Stripe configuration, platform billing, and the full team
directory. That was not intended.

STEP 1 — narrow the function back to owner-only.

CREATE OR REPLACE FUNCTION public.has_org_financial_access(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$function$;

COMMENT ON FUNCTION public.has_org_financial_access(uuid) IS
  'OWNER ONLY. Do not widen this. It is shared by a DO-loop policy across eleven
   financial tables (20260709144431:83-104), by organization_invites, and by
   list_org_members(), so widening it grants far more than the caller you are
   looking at. On 2026-07-30 it was briefly widened to include manager and
   silently exposed payroll, expenses, disputes, Stripe config and the member
   directory. If a specific table needs a broader role, grant it AT THAT TABLE.';

STEP 2 — grant managers invoice access explicitly, at the two tables.

Replace today's two RESTRICTIVE policies so the staff-facing grant is inline and
visible at the point of use, rather than inherited from a shared function.

DROP POLICY IF EXISTS "Restrict invoices to financial access or own customer" ON public.invoices;
CREATE POLICY "Restrict invoices to financial access or own customer"
ON public.invoices
AS RESTRICTIVE
FOR ALL
TO public
USING (
  -- Owner or manager, stated here so widening a shared predicate cannot
  -- silently change who can read invoices.
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
  )
  OR (
    customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = invoices.customer_id
        AND c.user_id = auth.uid()
        AND c.organization_id = invoices.organization_id
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = invoices.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
  )
);

DROP POLICY IF EXISTS "Restrict invoice items to financial access or own customer" ON public.invoice_items;
CREATE POLICY "Restrict invoice items to financial access or own customer"
ON public.invoice_items
AS RESTRICTIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = invoice_items.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
  )
  OR EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    WHERE i.id = invoice_items.invoice_id
      AND c.user_id = auth.uid()
      AND c.organization_id = invoice_items.organization_id
  )
);

Keep both AS RESTRICTIVE and TO public exactly as they are — that is what stops a
future permissive policy reopening these tables, and it is the one part of today's
migration that was right.

DO NOT change any of the eleven DO-loop policies. Narrowing the function in step 1
restores owner-only on the other nine, which is the desired outcome. Do not touch
organization_invites or list_org_members either — same reason.

AFTERWARDS, please paste this so I can see the revert took effect:

  -- the function is owner-only again
  select pg_get_functiondef('public.has_org_financial_access(uuid)'::regprocedure);

  -- every policy still referencing it, and on which table
  select tablename, policyname, cmd, permissive
  from pg_policies
  where schemaname='public'
    and (qual ilike '%has_org_financial_access%' or with_check ilike '%has_org_financial_access%')
  order by tablename, policyname;

  -- the two invoice policies should now name the roles inline, not the function
  select tablename, policyname, permissive, qual
  from pg_policies
  where schemaname='public' and tablename in ('invoices','invoice_items')
  order by tablename, policyname;

Confirm the migration RAN, not just that a file was created.
```

## Expected result

- `has_org_financial_access` → owner only
- Managers keep `invoices` / `invoice_items` (inline grant)
- Managers lose payroll_payments, payroll_settings, payroll_audit_log, stripe_subscriptions, org_stripe_settings, manual_payments, expenses, disputes, tips, organization_invites, and `list_org_members`
- `AS RESTRICTIVE` retained on both invoice tables

## Note on `tips`

Today's migration also dropped `"Org members can view tips"` / `"Org members can update tips"` and added staff-self-read-by-assignment. **That part is good and this revert leaves it alone.** After narrowing, `tips` is owner (via the loop policy) plus the assigned staff member — which is a better model than either previous state.
