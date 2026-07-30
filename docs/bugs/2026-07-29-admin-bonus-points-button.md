# Admin "add bonus points" button — likely rejected by RLS

**Status:** Open — needs a 5-minute empirical check to confirm
**Found:** 2026-07-29, while investigating loyalty tiers
**Severity:** Low-to-moderate. **Not silent** — see correction below.
**File:** `src/components/admin/LoyaltyProgramSettings.tsx:88-136`

---

## Correction to the original framing

The concern as raised was: *"someone has been granting points that never landed and had no way to know."*

**The second half is not accurate.** There is an `onError` handler at `:133-135`:

```ts
onError: () => {
  toast.error('Failed to add bonus points');
},
```

So if the insert is rejected, the admin **does** see "Failed to add bonus points." This is a visibly broken button, not silent data loss. Worth correcting because it changes the priority: nobody has been misled about whether it worked.

The failure is also **clean, not partial**. The `loyalty_transactions` insert runs *first* (`:91-98`) and throws at `:100` before anything touches `customer_loyalty`:

```ts
if (txError) throw txError;
```

So on rejection: no transaction row **and** no points granted. There is no half-applied state to repair.

## The suspected defect

The insert omits `organization_id` (`:91-98`):

```ts
const { error: txError } = await supabase
  .from('loyalty_transactions')
  .insert({
    customer_id: customerId,
    points,
    transaction_type: 'bonus',
    description: 'Bonus points awarded by admin',
  });
```

Live query of `pg_policies` (2026-07-29) showed `loyalty_transactions` has an **INSERT policy using `is_org_member`**. With `organization_id` NULL, `is_org_member(NULL)` expands to `EXISTS (SELECT 1 … WHERE organization_id = NULL …)`, which is never true — so `WITH CHECK` fails and the insert is rejected with `42501`.

## Why this is a hypothesis, not a confirmed bug

That same query reported **five policies** on the table. Postgres OR-combines policies for a given command, so **if any other INSERT policy is permissive, the insert succeeds** and this whole item is moot. I have the summary of that output, not the full policy bodies, so I cannot resolve it from here.

**To confirm in ~5 minutes:** open Admin → Loyalty, add bonus points to any customer, watch the network tab.
- `42501` + "Failed to add bonus points" toast → confirmed; fix is to add `organization_id`.
- `201` + success toast → not a bug; close this item.

## Fix if confirmed

Add the org id. `LoyaltyProgramSettings` already has `organizationId` in scope (used at `:63`, `:70`):

```ts
.insert({
  customer_id: customerId,
  organization_id: organizationId,
  points,
  transaction_type: 'bonus',
  description: 'Bonus points awarded by admin',
});
```

## The more serious thing found next to it

`addBonusPoints` **writes a tier string computed from hardcoded thresholds** (`:113`, `:120`, and `calculateTier` at `:138-143`):

```ts
const calculateTier = (lifetimePoints: number): string => {
  if (lifetimePoints >= 5000) return 'platinum';
  if (lifetimePoints >= 2000) return 'gold';
  if (lifetimePoints >= 500) return 'silver';
  return 'bronze';
};
```

The `award_loyalty_points` DB trigger does the same thing with the same hardcoded numbers (`20251224071611:36-43`).

So `customer_loyalty.tier` is a **stored, denormalized string written in two places, both ignoring `client_tier_settings`** — and 29 orgs have configured custom thresholds. That is not a display bug; it persists a wrong tier to the database, and the portal reads it (`ClientPortalContext.tsx:143`, `:375`).

**This is tracked as part of Part 3** in `docs/superpowers/plans/2026-07-29-loyalty-tiers-only.md`, not here — it is a design problem, not a missing column. Noted here only because the two live in the same function.
