# Loyalty: Tiers Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove points redemption entirely and make loyalty tiers per-org configurable, with tier definitions and benefits that every org controls — replacing TidyWise Cleaning's hardcoded four.

**Scope as of 2026-07-29:** **Parts 1 and 3 only. Part 2 (automatic price application) is CUT** — see "Part 2 — CUT" below. Benefits are displayed and honoured by a human; no booking price is modified by this work.

**Tier basis: `min_spending` / `max_spending` — LIFETIME DOLLARS.** Decided 2026-07-29, reversing an earlier `lifetime_points` call. 29 orgs have deliberately set dollar thresholds; converting them on an unenforced "points ~ dollars" ratio is worse than fixing the one frontend file that disagrees. **No migration, no conversion** — the 29 orgs' config keeps meaning what its owners intended.

**Requirement on that value:** it must be **lifetime** spending — accumulated from completed bookings, never reduced. A refund must not demote anyone. **No such value exists today**; it must be derived once and then stored monotonically. See "Lifetime spending" in Part 3.

**Architecture:** The spendable-points concept is deleted. `customer_loyalty` gains a monotonic `lifetime_spend` accumulator. `client_tier_settings` stays the per-org home and gains typed rule columns alongside its display strings. `src/lib/loyaltyTier.ts` and `LoyaltyTierBanner` stop using hardcoded thresholds and read the org's real config.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind/shadcn; Supabase Postgres + Deno edge functions; Capacitor iOS wrapper.

---

## Live Verification Results (2026-07-29)

Verified against the live database via PostgREST schema probing (CLAUDE.md rule 4 technique), **not** migration files.

### Confirmed live

| Fact | Evidence |
|---|---|
| `client_tier_settings` columns are exactly `id, organization_id, tier_name, tier_order, min_spending, max_spending, benefits, color` | `select=` on all → HTTP 200; control `zzz_not_a_column` → `400 / 42703` |
| **No typed-rule column exists.** `benefit_rules`, `rules`, `discount_percent`, `config`, `settings`, `metadata` all absent | each → `400 / 42703` |
| `customers.credits` exists | HTTP 200 |
| `customer_loyalty.points`, `.lifetime_points`, `.tier` exist | HTTP 200 |
| `organization_pricing_settings.loyalty_program_enabled` exists (this is the program toggle, **not** on `business_settings`) | HTTP 200 |
| Live booking price columns: `bookings.subtotal`, `.total_amount`, `.discount_amount`, `.discount_id` | HTTP 200 each |
| `bookings.total_price`, `.discount_percent`, `.tier_discount_amount`, `.loyalty_tier_applied` do **not** exist | `400 / 42703` |
| Existing discount system: `discounts` table with `id, organization_id, code, discount_type, discount_value, is_active` | HTTP 200; `value`/`amount`/`percent`/`name` absent |
| `get_loyalty_tier_info` correctly revoked from anon | RPC POST → `401 / 42501 permission denied for function` |

### Live-vs-code discrepancies found (all four matter)

**1. `business_settings.loyalty_redemption_threshold` and `loyalty_redemption_dollar_value` DO NOT EXIST LIVE.**

`redeem-loyalty-points/index.ts:33-37` selects them:

```ts
const { data: bizSettings } = await supabase
  .from("business_settings")
  .select("loyalty_redemption_threshold, loyalty_redemption_dollar_value")
```

That query returns `42703` — and the code destructures only `data`, discarding `error`. So `bizSettings` is null and it silently falls through to the hardcoded defaults at `:39-40` (`100` / `10.00`). **The "org-configurable threshold" has never worked.** Every redemption in production was 100 pts → $10, regardless of org. Consequence for this plan: *there is no per-org redemption config to migrate or preserve.* Simplifies Part 1.

**2. Tier basis conflict — the DB and the frontend disagree on what defines a tier.**

- `client_tier_settings` keys tiers on **`min_spending` / `max_spending`** (dollars).
- `src/lib/loyaltyTier.ts:10-15` keys tiers on **`minLifetimePoints`** (points), with the comment "Points ~ dollars spent."
- `get_loyalty_tier_info` returns `min_spending` / `max_spending`.

These are two different axes. **RESOLVED 2026-07-29 by data: `min_spending` (dollars) is the basis.** Query 1 showed **29 orgs have deliberately set dollar thresholds.** Converting 29 orgs' intentional config to points on a ratio nothing enforces is a worse trade than fixing the single frontend file that disagrees. `client_tier_settings` keeps its existing shape; **no schema conversion, no data migration.**

The work moves to the frontend instead: `src/lib/loyaltyTier.ts` and `LoyaltyTierBanner` stop using hardcoded point thresholds and read `client_tier_settings` via the existing RPC. See Part 3.

**Follow-on requirement:** the compared value must be *lifetime* spending, never reduced. That value does not exist yet — see "Lifetime spending" in Part 3 for what does exist, why it is not usable, and the recommended derivation.

**3. `loyalty_transactions` live RLS policy references the `staff` table, not `is_org_member(organization_id)`.**

Anon probe returned `401 / 42501 permission denied for table staff` — meaning policy evaluation touches `staff`. The migration I read (`20260119210328:131-133`) uses `is_org_member(organization_id)`. Live differs. Rule 4b confirmed again. **Do not act on my earlier RLS-invisibility conclusion without re-checking live** — the practical visibility of `organization_id IS NULL` rows depends on the actual live policy, which I could not read.

**4. There is no server-side price authority.**

`calculateBasePrice` lives in `src/lib/pricingEngine.ts` and has exactly two consumers, **both frontend**:
- `src/components/admin/booking-form/BookingFormContext.tsx:12`
- `src/pages/PublicBookingPage.tsx:45`

No edge function computes a booking price. Both surfaces compute in the browser and insert the total they computed. This is the single most important constraint in this plan — see Part 2 architecture.

### Could NOT determine — blocked, and you asked for these

The anon key cannot read any row. **Positive control:** `organizations?select=id` also returned `*/0` with `[]`, so every zero is RLS-filtered, not a real count. The Supabase MCP returns `You do not have permission` for project `slwfkaqczvwvvvavkgpr` (Lovable Cloud — no dashboard, no service key), exactly as CLAUDE.md documents.

**Unanswered:**
1. Whether any org has customised `client_tier_settings`
2. How many customers hold points, and at what balances
3. How much `customers.credits` accrued
4. How many `loyalty_transactions` rows are `transaction_type = 'redeemed'`

**#2 and #4 decide how much care Part 1 needs.** Run this in the Lovable chat before starting Part 1:

```sql
-- 1. Has any org customised tiers?
select organization_id, count(*) as tier_rows
from public.client_tier_settings
group by organization_id
order by tier_rows desc;

-- 2. Who holds points, and how much?
select count(*) filter (where points > 0)        as customers_with_points,
       count(*)                                   as loyalty_rows,
       coalesce(sum(points), 0)                    as total_points_outstanding,
       coalesce(max(points), 0)                    as largest_balance,
       coalesce(round(avg(points) filter (where points > 0), 1), 0) as avg_nonzero
from public.customer_loyalty;

-- 3. How much never-honoured credit exists, and from which source?
select count(*) filter (where coalesce(credits,0) > 0) as customers_with_credit,
       coalesce(sum(credits), 0)                        as total_credit_dollars,
       coalesce(max(credits), 0)                        as largest_credit
from public.customers;

-- 4. How many redemptions actually happened?
select transaction_type, count(*) as rows, coalesce(sum(points),0) as points_sum
from public.loyalty_transactions
group by transaction_type
order by rows desc;

-- 5. Repeat-press evidence: customers with >1 redemption
select customer_id, count(*) as redemptions, coalesce(sum(points),0) as points_removed
from public.loyalty_transactions
where transaction_type = 'redeemed'
group by customer_id
having count(*) > 1
order by redemptions desc
limit 50;

-- 6. Confirm the live RLS policy on loyalty_transactions (discrepancy #3)
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'loyalty_transactions';

-- 7. Confirm tier basis data actually present
select tier_name, tier_order, min_spending, max_spending, benefits
from public.client_tier_settings
order by organization_id, tier_order
limit 40;
```

**Decision gate:** if query 2 shows fewer than ~20 customers with nonzero points and query 4 shows fewer than ~10 redemptions, Part 1 can be a straight removal (Tasks 1.1–1.4) and you can skip the reconciliation work in Task 1.5. If the numbers are larger, Task 1.5 becomes mandatory.

### RESULTS RECEIVED — 2026-07-29

| Query | Result | Consequence |
|---|---|---|
| 1 / 7 — org tier customisation | **29 orgs have deliberately set dollar `min_spending` thresholds** | **Tier basis reversed to `min_spending`.** No conversion, no migration. Part 3 becomes a frontend fix + a lifetime-spend derivation. |
| 4 — redemptions | **4 redemptions, 2 customers, $40 credit** | **Part 1 is a straight removal.** |
| 3 — unhonoured credit | $40 across 2 customers | Task 1.4 still runs: freeze, do not zero, export the two balances first. |
| 6 — live RLS | `loyalty_transactions` **has** `organization_id` and **five** policies, including an INSERT with `is_org_member` | **My earlier RLS-invisibility concern is WRONG and is closed.** Audit rows are visible. Task 1.3's backfill drops to optional hygiene. |

**Task 1.5 (point restore): SKIPPED** by decision. 400 points across 2 customers; the owner will restore by hand if at all. The task is retained below, marked skipped, so the reasoning survives if the numbers ever change.

---

## Global Constraints

- **`supabase/` is Lovable's, not ours.** Every schema change and edge-function change in this plan ships as a **paste-ready Lovable prompt**, never a local edit to `supabase/`. Each such task ends with "confirm deployed, not just committed."
- **A git push deploys nothing backend.** Migrations and functions require Lovable to run/deploy them.
- **Verify schema against the live DB after every Lovable migration** (rules 4 and 4b — drift runs both directions).
- **Typecheck command is `npx tsc --noEmit -p tsconfig.app.json`.** The `-p` flag is mandatory; a bare `tsc` compiles zero files.
- **Never put a `Set` or `Map` in a persisted react-query result** (App.tsx `containsMapOrSet` guard is deliberately shallow).
- **Tier rules must never be served from the offline cache.** Same reasoning that excludes `service-pricing` from persistence: a stale cached rule could mis-charge a customer. Exclude the tier-rules query from persistence explicitly.
- **Do not swallow errors into empty state.** No `catch { return [] }`. Surface to react-query `error` and Sentry (`src/lib/sentry.ts`).
- **Every query and policy is scoped by `organization_id`.**
- **Money: display must mirror what actually charges.** A shown discount must equal the applied discount.
- Run `npm run lint` and the relevant Playwright spec before calling any task done.

---

# PART 1 — REMOVE REDEMPTION

## What to do with existing data — decide these before Task 1.1

You asked to decide deliberately rather than by default. Three separate questions, three different answers.

### 1a. Points already spent → ⛔ **decided: do NOT restore** (2026-07-29)

**Final decision: leave them.** 4 redemptions, 2 customers, 400 points, $40. The owner will restore by hand if at all. Task 1.5 is skipped.

The reasoning below is retained because it is the argument that would apply at any larger scale — and because it explains *why* the number was small enough to ignore.

Redemption decremented `customer_loyalty.points` (`:69`) but **never** `lifetime_points`. Tier today derives from `lifetime_points` (`loyaltyTier.ts:31`, `computeTierProgress(lifetimePoints, …)`). So **redemption never affected anyone's tier.**

That has a sharp consequence: whether you restore the points depends entirely on which column becomes the tier basis in Part 3.

- If tier basis stays `lifetime_points` → restoring `points` is cosmetic; `points` becomes a vestigial display number.
- If tier basis becomes `points` (your stated intent, "points determine the tier") → **restoring is required for correctness.** Otherwise customers who redeemed are permanently docked tier progress in exchange for a $10 credit that no system ever honoured. They'd be penalised twice.

**Recommendation: restore.** It is one reversible `UPDATE` derived from an existing audit trail, it makes the number truthful under either basis, and it removes a landmine from the Part 3 decision. Restoring can only promote customers, never demote — so it cannot take a benefit away from anyone.

### 1b. `customers.credits` → **stop writing, keep the data, export a report**

Nothing ever read this column. It has two writers — `redeem-loyalty-points:119-122` and the referral trigger (`20260722214444:73`) — so the balance is a **mix of never-honoured loyalty credit and never-honoured referral credit.**

- ❌ Don't zero it. Those numbers are the only evidence of what customers were promised. Deleting them destroys your ability to honour anything as goodwill, and destroys the audit trail for a money-adjacent bug.
- ❌ Don't leave it live and unread. That's the status quo that caused this.
- ✅ **Stop writing to it, keep the values, and export a one-time report of nonzero balances** so you can decide per customer whether to honour. Leave the column in place, unread, and comment it as frozen.

**Flagging a separate problem:** dropping loyalty redemption does **not** fix the referral credit path. `20260722214444:73` still writes `credits`, and nothing still reads it. Referral credits have exactly the same write-only defect. That is out of scope here but should not be lost — see "Out of scope" below.

### 1c. `loyalty_transactions` → **keep everything, backfill `organization_id`**

Keep the table and keep the `redeemed` rows. Under tiers-only it remains a legitimate points-earning history, and the `redeemed` rows are the evidence Task 1.5 derives the restore from.

Also **backfill the missing `organization_id`** (the insert at `:94-99` omitted it) from `customers.organization_id`, so the rows are visible under whatever the live policy actually is. Do this *before* the restore, so the restore query can be org-scoped.

Stop writing new `redeemed` rows (falls out of deleting the function).

---

## File Structure — Part 1

- Modify: `src/pages/portal/PortalDashboardPage.tsx` — delete `LoyaltyRedeemButton` (`:112-157`), delete its render block (`:663-672`), fix the inline-component remount bug in `LoyaltyCard` (`:645`)
- Delete: `supabase/functions/redeem-loyalty-points/` (via Lovable)
- Migration (via Lovable): backfill `loyalty_transactions.organization_id`; restore redeemed points; comment `customers.credits` as frozen
- Modify: `supabase/config.toml` — remove the `redeem-loyalty-points` entry if present (via Lovable)

---

### Task 1.1: Remove the Redeem button from the portal

**Files:**
- Modify: `src/pages/portal/PortalDashboardPage.tsx:112-157` (delete component), `:663-672` (delete render), `:645` (fix remount bug)

**Interfaces:**
- Consumes: nothing
- Produces: `LoyaltyCard` becomes a stable top-level component `PortalLoyaltyCard` with props `{ points: number; tier: string | null }`

Note the `:645` fix is folded in here deliberately. `LoyaltyCard` is an inline arrow component defined inside the parent render body, so every parent re-render remounts it. That is the root cause of the repeatable-redemption bug. Even with the button gone, leaving the pattern in place leaves the same trap for the tier UI that replaces it — so it gets fixed in the same task.

- [ ] **Step 1: Write the failing test**

Create `tests/portal-loyalty-no-redeem.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { loginToPortal } from './helpers/portal-auth';

test('portal loyalty card shows tier and points but offers no redemption', async ({ page }) => {
  await loginToPortal(page);
  const card = page.getByTestId('portal-loyalty-card');
  await expect(card).toBeVisible();
  // Tier and points still shown
  await expect(card).toContainText(/pts/i);
  await expect(card).toContainText(/member/i);
  // No redemption affordance anywhere on the page
  await expect(page.getByRole('button', { name: /redeem/i })).toHaveCount(0);
  await expect(page.getByText(/credit added to your account/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/portal-loyalty-no-redeem.spec.ts --config=playwright.qa.config.ts`
Expected: FAIL — the Redeem button is still present, so `toHaveCount(0)` fails with count 1.

- [ ] **Step 3: Delete the button component**

Delete `PortalDashboardPage.tsx:112-157` entirely (the whole `LoyaltyRedeemButton` function). Then remove the now-unused imports — check whether `Star` (lucide) and `fmt` are still used elsewhere in the file before deleting either; `Loader2` is used elsewhere, keep it.

- [ ] **Step 4: Extract `LoyaltyCard` to a stable top-level component**

Delete the inline `const LoyaltyCard = () => (…)` at `:645-675` and add this **above** the page component (module scope, so its identity is stable across renders):

```tsx
function PortalLoyaltyCard({ points, tier }: { points: number; tier: string | null }) {
  const tierProgress = tierProgressMap[tier?.toLowerCase() ?? ''] ?? 25;
  return (
    <Card className="pv-quiet" data-testid="portal-loyalty-card">
      <CardContent className="px-4 sm:px-2 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="pv-eyebrow mb-1">Loyalty</p>
            <p className="text-[13.5px] text-[hsl(var(--pv-ink-2))] capitalize">
              <span className="text-[hsl(var(--pv-ink))] font-medium">{points}</span> pts
              <span className="text-[hsl(var(--pv-ink-4))] mx-1.5">·</span>
              {tier} member
            </p>
          </div>
          <Trophy className="h-4 w-4 text-[hsl(var(--pv-ink-4))] shrink-0" />
        </div>
        <Progress value={tierProgress} className="h-1 mt-3 bg-[hsl(var(--pv-sunken))]" />
      </CardContent>
    </Card>
  );
}
```

Move `tierProgressMap` to module scope too if it is currently inside the component.

- [ ] **Step 5: Update both call sites**

`:1091` and `:1099` currently render `<LoyaltyCard />`. Replace both with:

```tsx
<PortalLoyaltyCard points={displayLoyalty.points} tier={displayLoyalty.tier} />
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Run: `npm run lint`
Expected: both clean. If `tsc` reports an unused import, remove it.

- [ ] **Step 7: Run the test to confirm it passes**

Run: `npx playwright test tests/portal-loyalty-no-redeem.spec.ts --config=playwright.qa.config.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/portal/PortalDashboardPage.tsx tests/portal-loyalty-no-redeem.spec.ts
git commit -m "feat(loyalty): remove points redemption from client portal

Deletes LoyaltyRedeemButton and extracts LoyaltyCard to a stable
top-level component. The inline component definition caused a remount
on every parent re-render, which reset the in-flight guard and allowed
repeated redemptions."
```

---

### Task 1.2: Lovable prompt — delete the redemption function

**Files:**
- Delete (via Lovable): `supabase/functions/redeem-loyalty-points/`
- Modify (via Lovable): `supabase/config.toml`

- [ ] **Step 1: Confirm no caller remains**

Run: `grep -rn "redeem-loyalty-points" src/ --include="*.ts" --include="*.tsx"`
Expected: no results. If any remain, Task 1.1 was incomplete — fix before proceeding.

- [ ] **Step 2: Send this prompt to Lovable**

```
Delete the edge function `redeem-loyalty-points` entirely (the whole
supabase/functions/redeem-loyalty-points/ directory).

Also remove its entry from supabase/config.toml if one exists.

Context: loyalty is moving to a tiers-only model. Points redemption is being
removed product-wide. The client portal caller has already been deleted, so
this function is now unreachable. Its credit output was written to
customers.credits, which no code has ever read.

Please confirm the function is DELETED AND UNDEPLOYED, not just removed from
the repo — a deleted directory does not undeploy a live function.
```

- [ ] **Step 3: Verify it is actually gone**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{}' \
  https://slwfkaqczvwvvvavkgpr.supabase.co/functions/v1/redeem-loyalty-points
```

Expected: `404`. A `401`/`400` means it is still deployed and Lovable only removed the file.

- [ ] **Step 4: Commit the local reflection of the change**

```bash
git add -A supabase/
git commit -m "chore(loyalty): drop redeem-loyalty-points function"
```

---

### Task 1.3: Lovable prompt — backfill `loyalty_transactions.organization_id` — ⚪ OPTIONAL

**Downgraded 2026-07-29.** Query 6 showed the table has `organization_id` and five policies, and the audit rows are visible — so the RLS-invisibility concern that motivated this task was wrong and is closed. Task 1.5 is also skipped, so nothing depends on this being org-scoped.

Keep it only as cleanup if the `pg_policies` output showed rows with `organization_id IS NULL`. With 4 redemption rows total, this is discretionary.

- [ ] **Step 1: Send this prompt to Lovable**

```
Run a migration that backfills the missing organization_id on
public.loyalty_transactions.

Rows written by the (now deleted) redeem-loyalty-points function and by the
admin "add bonus points" action omitted organization_id, so they are NULL.
That makes them invisible to org-scoped reads and to any RLS policy that
filters on organization_id.

UPDATE public.loyalty_transactions lt
SET organization_id = c.organization_id
FROM public.customers c
WHERE lt.customer_id = c.id
  AND lt.organization_id IS NULL;

Then report back:
  SELECT count(*) AS still_null
  FROM public.loyalty_transactions
  WHERE organization_id IS NULL;

Rows still NULL after this are orphans whose customer was deleted — leave
them, but tell me the count.

Also please paste the output of:
  SELECT policyname, cmd, qual, with_check FROM pg_policies
  WHERE schemaname='public' AND tablename='loyalty_transactions';

I need to see the actual live policy — the migration files and live state
disagree on this table.

Confirm the migration RAN, not just that the file was created.
```

- [ ] **Step 2: Record the reported policy in this plan**

Paste Lovable's `pg_policies` output into a comment block here. Task 3.x decisions depend on it.

- [ ] **Step 3: Commit**

```bash
git add -A supabase/migrations/
git commit -m "fix(loyalty): backfill organization_id on loyalty_transactions"
```

---

### Task 1.4: Lovable prompt — freeze `customers.credits` and export the report

- [ ] **Step 1: Send this prompt to Lovable**

```
Two things on public.customers.credits.

1. Add a column comment marking it frozen, so nobody wires it up again
   without reading the history:

COMMENT ON COLUMN public.customers.credits IS
  'FROZEN 2026-07-29. Written by the deleted redeem-loyalty-points function
   and by the referral credit trigger; never read by any code path. Values
   are retained as evidence of credit promised to customers but never
   honoured. Do not write to this column. Do not zero it. See
   docs/superpowers/plans/2026-07-29-loyalty-tiers-only.md.';

2. Give me a one-time export of every nonzero balance so I can decide
   whether to honour any of it as goodwill:

SELECT c.id, c.first_name, c.last_name, c.email, c.organization_id,
       c.credits,
       (SELECT coalesce(sum(abs(lt.points)),0) FROM public.loyalty_transactions lt
         WHERE lt.customer_id = c.id AND lt.transaction_type = 'redeemed')
         AS points_spent_on_redemptions
FROM public.customers c
WHERE coalesce(c.credits,0) > 0
ORDER BY c.credits DESC;

Do NOT change any credits values. Do NOT drop the column.

Confirm the comment was applied and paste the export.
```

- [ ] **Step 2: Save the export**

Save Lovable's output to `docs/loyalty/2026-07-29-unhonoured-credits.csv`. This is the only record of what customers were promised — it must not live only in a chat log.

- [ ] **Step 3: Commit**

```bash
git add -A supabase/migrations/ docs/loyalty/
git commit -m "chore(loyalty): freeze customers.credits, export unhonoured balances"
```

---

### Task 1.5: Lovable prompt — restore redeemed points — ⛔ SKIPPED

**Decision 2026-07-29: not doing this.** Query 4 returned 4 redemptions across 2 customers (400 points, $40). The owner will restore by hand if at all. Retained below only so the reasoning survives if these numbers ever change.

Do **not** run this as part of Part 1.

- [ ] **Step 1: Send this prompt to Lovable**

```
Restore loyalty points that were deducted by the (now deleted) redemption
flow. Those deductions bought customers a store credit in customers.credits
that no code path ever read, so the points were spent for nothing.

Run inside a single transaction. Show me the before/after counts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.loyalty_points_restore_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  organization_id uuid,
  points_before integer NOT NULL,
  points_restored integer NOT NULL,
  points_after integer NOT NULL,
  restored_at timestamptz NOT NULL DEFAULT now()
);

WITH redeemed AS (
  SELECT customer_id, sum(abs(points))::int AS to_restore
  FROM public.loyalty_transactions
  WHERE transaction_type = 'redeemed'
  GROUP BY customer_id
)
INSERT INTO public.loyalty_points_restore_audit
  (customer_id, organization_id, points_before, points_restored, points_after)
SELECT cl.customer_id, cl.organization_id,
       coalesce(cl.points,0),
       r.to_restore,
       coalesce(cl.points,0) + r.to_restore
FROM public.customer_loyalty cl
JOIN redeemed r ON r.customer_id = cl.customer_id;

UPDATE public.customer_loyalty cl
SET points = coalesce(cl.points,0) + a.points_restored,
    updated_at = now()
FROM public.loyalty_points_restore_audit a
WHERE a.customer_id = cl.customer_id;

INSERT INTO public.loyalty_transactions
  (customer_id, organization_id, points, transaction_type, description)
SELECT a.customer_id, a.organization_id, a.points_restored, 'restored',
       'Points restored: redemption removed; store credit was never honoured'
FROM public.loyalty_points_restore_audit a;

SELECT count(*) AS customers_restored,
       sum(points_restored) AS total_points_restored
FROM public.loyalty_points_restore_audit;

COMMIT;

Notes:
- This can only increase balances, never decrease, so it cannot remove a
  benefit from anyone.
- lifetime_points is deliberately NOT touched — redemption never decremented
  it, so it is already correct.
- The audit table makes this fully reversible.

Confirm the migration RAN and paste the final counts.
```

- [ ] **Step 2: Verify no customer lost points**

Ask Lovable to run:

```sql
select count(*) from public.loyalty_points_restore_audit
where points_after < points_before;
```

Expected: `0`. Anything else means the restore is wrong — stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add -A supabase/migrations/
git commit -m "fix(loyalty): restore points spent on never-honoured store credit"
```

---

# PART 2 — MAKE TIERS REAL — ⛔ CUT 2026-07-29

> **This part is NOT being built.** Decision recorded 2026-07-29.
>
> **Why cut:** it is the only part that touches money on every booking, and it depends on a server-side price authority that does not exist in this codebase (verification Finding 4). Building tier discounts on client-computed pricing would add a second forgeable input to an already-forgeable total. That underlying defect is now tracked separately at `docs/security/2026-07-29-booking-price-authority.md` and must be fixed **before** any of this is reconsidered.
>
> **What ships instead:** benefits are displayed per tier and honoured manually by the owner. A displayed benefit a human honours beats a silent discount nobody can explain.
>
> **If revisited, scope is pre-agreed:** `discount_percent` and `waive_fees` **only**. No every-Nth counters (they reintroduce the counter semantics Part 1 deletes), no free-add-on selection UI.
>
> The analysis below is retained deliberately — it is the record of *why* this was cut and the starting point if it returns. The typed-rule columns in Task 3.1 still ship, so the data model will be ready.

## Which benefits are automatable, and which are promises

You asked me to say which fit rather than pretend all of them do. Here is the honest split across your four tiers' default benefits plus the three real examples you gave.

| Benefit | Verdict | Why |
|---|---|---|
| `5% / 10% / 15% discount` | ✅ **Fully automatable** | Pure function of `subtotal`. One numeric field. No state. |
| `same day booking no fee` | ✅ **Automatable, conditional** | A waiver flag plus a condition on booking lead time. Requires that a same-day fee is a distinct, identifiable line item — **verify this exists before promising it**; live probe shows no `bookings.service_fee` column, so the fee may not be modelled separately yet. |
| `1 free bi monthly cleaning` | ⚠️ **Automatable, needs derived state** | Needs a per-customer counter. Derivable from `bookings` (count completed), so no spendable balance — but see the concurrency note below. |
| `10% discount every 5th cleaning` | ⚠️ **Automatable, needs derived state** | Same shape. Also needs you to define "5th": 5th *booked* or 5th *completed*? These differ and the answer changes the code. |
| `Free add-on` | ⚠️ **Semi-automatable** | The rule is expressible ("one add-on at $0, up to value X"), but *which* add-on requires a selection at booking time and per-org config of eligible add-ons. Meaningful UI work, not just a rule. |
| `Priority booking` | ❌ **Not automatable as pricing** | This is scheduling/dispatch, not price. It could become codeable *only* if there is a lead-time or capacity restriction to relax for higher tiers. There isn't one today. Until then it is an operational promise a human keeps. |
| `VIP support` | ❌ **Operational promise** | No code meaning. Display string only. |
| `Welcome reward` (Bronze) | ❌ **Not a rule** | Too vague to type. Display only, or replace it with something concrete. |

**So: two clean wins, two counter-based, one needing UI, three that stay as text.**

**The concurrency note, stated plainly:** the every-Nth benefits reintroduce counter semantics — the exact class of bug Part 1 deletes. Two bookings created concurrently could both compute "this is the 5th." It is *less* dangerous than the points ledger (the counter is derived from `bookings`, not a stored spendable balance, so it self-corrects), but it is not free. This is why every-Nth is first on my cut list.

## Where a booking price is calculated, and which are customer-reachable

Verified live. Four surfaces, and they do **not** all price:

| Surface | Prices? | Customer-reachable | Tier applies today |
|---|---|---|---|
| Admin stepper — `BookingFormContext.tsx:12` → `calculateBasePrice` | ✅ browser | Owner/admin acting for a customer | Would need work |
| Public booking form — `PublicBookingPage.tsx:45` → `calculateBasePrice` | ✅ browser | **Yes — anonymous or returning customer** | Would need work |
| Portal request page — `PortalRequestPage.tsx` | ❌ **does not price at all** | Yes, logged-in customer | N/A — priced later by admin |
| `external-booking-webhook:288` / `ingest-external-booking:138` | ❌ accepts `total_amount` from payload, defaults `0` | Third-party integration | Cannot apply without server logic |

Two consequences you should sit with:

**First, your instinct in the brief was right and the situation is worse than "one of four."** Only two surfaces price at all, and both do it **in the browser**. There is no server-side price authority anywhere in this codebase. A tier discount computed client-side on the public booking form is forgeable by anyone with devtools — and that form is reachable unauthenticated.

**Second, the portal request page not pricing is actually convenient.** It creates a request that an admin prices later through the admin stepper — so covering the admin stepper covers the portal path automatically.

### Recommended architecture: one Postgres function, two consumers

Do **not** add tier logic to `pricingEngine.ts`. That would put the rule in the browser, leave the webhook uncovered, and make the discount forgeable.

Instead:

1. **`resolve_tier_benefits(p_customer_id uuid)`** — a `SECURITY DEFINER` Postgres function returning the typed rule set for that customer's current tier. It authorizes the caller internally (CLAUDE.md rule 2 — never grant a definer function to `authenticated` without an internal check).
2. **Authority: a `BEFORE INSERT` trigger on `bookings`** calls it, computes `tier_discount_amount`, and recomputes `total_amount` server-side — overwriting whatever the client sent. This covers **all four surfaces at once**, including the webhook, and cannot be forged.
3. **Display: an RPC** wrapping the same function, so the admin stepper and public form can *show* the discount before submitting. Same source of truth, so display always matches what the trigger will apply.

This is the design that makes "applies in one and not the others" structurally impossible — the trigger is the only writer of the discount.

### Tier resolution failure: fail **open**, but never silently

You framed this exactly right. My recommendation:

**Fail open on price — charge full price — and make the failure visible.**

Reasoning: a blocked booking is a lost sale and an angry customer for a benefit worth 5–15%. A missed discount is recoverable — the owner can honour it manually. The asymmetry is clear. This is the opposite of `marketing-guard.ts`, which correctly fails *closed*, because there the risk is statutory TCPA damages rather than goodwill.

But fail-open must not be silent, for the reason you gave: a silent full price is indistinguishable from a pricing bug. So:

- Trigger sets `tier_discount_amount = 0` and `tier_resolution_status = 'failed'` on the booking row.
- Report to Sentry (`src/lib/sentry.ts`) — this is an error, not an expected path.
- Surface it in the admin booking view as "Tier discount could not be verified — review before charging."
- **Never fail open in the direction of a larger discount.** If the rule set is unreadable, the discount is 0, never a guessed default.

### How the customer sees it

A silent total change is a pricing bug from their side. So the discount must be a **line item with a label**, and the booking must **snapshot what was applied** — because a customer's tier can change later and the receipt must still explain the price it charged.

That means new columns on `bookings` (none of these exist live — verified):
- `tier_discount_amount numeric` — the money
- `tier_name_applied text` — snapshot, e.g. `'Gold'`
- `tier_discount_percent numeric` — snapshot of the rate used
- `tier_resolution_status text` — `'applied' | 'no_tier' | 'failed'`

Rendered everywhere a total appears: booking confirmation screen, the confirmation email (`send-booking-email` — which already supports `{{tokens}}`), the invoice (`send-invoice`), and the portal booking detail. Wording: **"Gold member discount (10%) −$18.00"**. Explicit rate, explicit money, named tier.

## File Structure — Part 2 (not being built; kept for a future pass)

- Migration (via Lovable): `bookings` snapshot columns, `resolve_tier_benefits()`, `apply_tier_benefits()` trigger
- Create: `src/lib/tierRules.ts` — shared TS types mirroring the typed rule set
- Create: `src/hooks/useTierBenefits.ts` — RPC wrapper; **must be excluded from query persistence**
- Modify: `BookingFormContext.tsx`, `PublicBookingPage.tsx` — display the discount
- Modify: `BookingDialogs.tsx` — surface `tier_resolution_status = 'failed'`

**Prerequisite before any of this is attempted:** `docs/security/2026-07-29-booking-price-authority.md` must be resolved. Steps are intentionally not expanded into TDD tasks — doing so now would bake in signatures that a price-authority design will change.

---

# PART 3 — EDITABLE PER ORG

## Is `client_tier_settings` the right home? **Yes — and it ships unchanged**

Verified live, `client_tier_settings` is exactly:

```
id, organization_id, tier_name, tier_order, min_spending, max_spending, benefits, color
```

**What it gets right:** it is already per-org, already has ordering, already has a display name and colour, and `get_loyalty_tier_info` already reads it with a sensible fallback to the four TidyWise defaults (`20260729193530:40-62`) and is already correctly locked to `service_role` (verified: anon RPC → `42501`). That plumbing is worth keeping — it is the right table.

**Two things it gets wrong:**

**1. `benefits` is a jsonb array of display strings.** Verified: no `benefit_rules`, `rules`, `discount_percent`, `config`, `settings`, or `metadata` column exists. So it models display only, exactly as you suspected. Nothing can act on it.

**2. It keys tiers on `min_spending` / `max_spending` — dollars — but you said points determine the tier.** This is discrepancy #2 from verification, and it is a **blocking decision.**

### The tier basis — DECIDED: `min_spending`, lifetime dollars

`client_tier_settings` defines tiers by **spending**. `src/lib/loyaltyTier.ts:10-15` defines them by **lifetime points**.

**Decision (2026-07-29): `min_spending` / `max_spending` is authoritative. The frontend is wrong and gets fixed.**

29 orgs have deliberately configured dollar thresholds. Converting that to points would rest on a "points ~ dollars" equivalence that no constraint enforces, and would silently redefine 29 owners' intent. Fixing one frontend file is smaller and truer.

**`client_tier_settings` keeps its exact current shape.** No `min_lifetime_points`, no conversion, no data migration. This also means `get_loyalty_tier_info`'s return signature is unchanged, so `client-portal-api/index.ts:374` needs no update.

---

## Lifetime spending — does the value exist? **No. It must be derived.**

You required: lifetime, summed from completed bookings, **never reduced** — a refund must not demote a Platinum customer. Here is what is actually there.

### Nothing stores it

Probed live — none of these exist on `customers`: `total_spent`, `lifetime_spend`, `lifetime_value`, `total_revenue`, `amount_spent`, `lifetime_spending`, `total_paid`. All return `42703`.

### There is a de-facto proxy, and the ratio IS enforced

`customer_loyalty.lifetime_points` is effectively lifetime dollars. `award_loyalty_points` (migration `20251224071611`) does:

```sql
:13  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
:14    -- Calculate points: 1 point per dollar spent
:15    points_to_award := FLOOR(NEW.total_amount);
```

So the "unenforced assumption" is in fact enforced at exactly 1:1 by the trigger. Worth knowing — but `lifetime_points` still **cannot** be used as lifetime spend, for four reasons:

1. **Migrated history is missing entirely.** The trigger is `AFTER UPDATE ON public.bookings` (`:66`) — UPDATE only. But `process-migration-import/index.ts:32` maps incoming CSV statuses straight to `"completed"` and **inserts** them. An INSERT never fires an UPDATE trigger, so **every migrated historical booking awarded zero points.** Any org that came from another system has customers whose real spend is invisible to `lifetime_points`. Given 29 orgs configured tiers, this is likely to affect real customers.
2. **Contaminated by manual grants.** `LoyaltyProgramSettings.tsx:112` adds admin bonus points to `lifetime_points` as well as `points`. Those dollars never existed.
3. **Floored per booking.** `FLOOR(NEW.total_amount)` discards up to $0.99 per booking. Immaterial against 500/2000/5000 thresholds, but it is not equal to spend.
4. **Wrong units in the name.** Treating a column called `lifetime_points` as dollars is precisely the implicit-unit assumption you just declined to build on.

### A live `SUM` is authoritative but **not** monotonic

`SUM(total_amount) WHERE status = 'completed'` would be correct today and would capture migrated history — but it fails your never-reduced requirement:

- `bookings.total_amount` is mutable after completion — `AdditionalChargesDialog.tsx:196` adds to it, **`:236` subtracts from it**.
- An admin can move a booking out of `completed`.
- Deleting a booking silently lowers the sum.

### Good news on refunds specifically

**Refunds already do not reduce spend, under either approach.** `process-refund/index.ts` operates entirely against the Stripe API and never writes to `bookings` — and no `refunded_amount` / `refund_amount` / `amount_refunded` column exists (all `42703`). A refund sets `payment_status = 'refunded'` while `status` stays `'completed'`.

So your Platinum-demotion worry is already safe on the refund axis. The monotonicity risk comes from **post-completion edits and status reversals**, not refunds.

### Recommendation: derive once, then store monotonically

Add to `customer_loyalty` (already one row per customer — `customer_id` is `isOneToOne: true`):

```sql
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS lifetime_spend numeric(12,2) NOT NULL DEFAULT 0;
```

- **Backfill once** from `SUM(total_amount) WHERE status='completed'` per customer.
- **Increment-only afterwards**, from the same trigger that awards points — and widen that trigger to `AFTER INSERT OR UPDATE` so future direct-completed inserts (migrations, external ingest) count.
- **Never decrement.** No refund path, no charge-edit path, no status reversal touches it. Monotonic **by construction**, not by convention.

### ⚠️ The backfill is a CORRECTION, not housekeeping — do not treat it as optional

**Customers at 29 businesses are sitting at the wrong tier right now.** Their imported booking history awarded zero loyalty points, because `award_loyalty_points` is `AFTER UPDATE` only (`20251224071611:66`) while `process-migration-import/index.ts:32` **inserts** rows already mapped to `status='completed'`. An INSERT never fires an UPDATE trigger.

The effect: a customer who migrated in with $6,000 of history shows `lifetime_points = 0` and sits at Bronze. Every clean they have ever paid for is invisible to the loyalty system. The backfill is what fixes that — it is the first time those customers get the tier they already earned.

Anyone reading this plan later and deciding to "skip the backfill for now" would be shipping the tier feature with the wrong answer for the orgs most likely to use it. **The backfill is the correction. The column is just where it lands.**

### Accepted caveat on the baseline

The backfill uses today's `SUM(total_amount)`, which includes any booking whose `total_amount` was edited after completion (`AdditionalChargesDialog.tsx:196` adds, `:236` subtracts). So the baseline is **"spend as currently recorded," not "spend as originally charged."**

**This is accepted, deliberately, and documented so it is not re-argued later.** Reconstructing original charges would mean replaying an edit history that is not retained. "As currently recorded" is the only defensible starting point available, and from the backfill forward the value is monotonic regardless.

### Rejected alternative

Comparing `min_spending` against a live `SUM` inside the RPC — no migration needed, but non-monotonic, so a post-completion charge edit or a status reversal could demote someone. **Rejected** against the explicit never-reduced requirement.

### Typed rule columns — ⛔ CUT (was Task 3.5)

Decided 2026-07-29: **no unread columns.** Three features this week turned out to be exactly that (`invoice_branding`, `reminder_email_body`, `automation_steps`). With Part 2 cut, `discount_percent` / `waive_fees` / `benefit_rules` would have no reader — so they are not being added. They come with Part 2, if Part 2 comes.

`client_tier_settings` therefore ships **entirely unchanged**. No `ALTER` at all in Part 3.

---

## The bigger problem: `customer_loyalty.tier` is stored, and computed from hardcoded thresholds in two places

This is worse than the banner bug and was found while checking the bonus-points button.

`tier` is a **denormalized string persisted on `customer_loyalty`**, written by two independent code paths that both hardcode TidyWise's point thresholds and both ignore `client_tier_settings`:

**1. The DB trigger** — `award_loyalty_points` (`20251224071611:35-43`):

```sql
-- Calculate new tier based on lifetime points
IF current_lifetime >= 5000 THEN
  new_tier := 'platinum';
ELSIF current_lifetime >= 2000 THEN
  new_tier := 'gold';
ELSIF current_lifetime >= 500 THEN
  new_tier := 'silver';
```

**2. The admin bonus-points path** — `LoyaltyProgramSettings.tsx:138-143`, written to the DB at `:120`:

```ts
const calculateTier = (lifetimePoints: number): string => {
  if (lifetimePoints >= 5000) return 'platinum';
  if (lifetimePoints >= 2000) return 'gold';
  if (lifetimePoints >= 500) return 'silver';
  return 'bronze';
};
```

And the portal displays that stored value (`ClientPortalContext.tsx:143`, `:375` — `tier: row.loyalty_tier`).

So there are **four** hardcoded-tier sites, not two, and two of them write to the database. For the 29 orgs with custom dollar thresholds, the persisted `tier` is simply wrong.

### Design decision: derive tier, stop storing it

A stored tier goes stale the moment an owner edits a threshold — every customer's `tier` would need recomputing on every settings save. That is a cache-invalidation problem nobody will remember to maintain.

**Make tier a single derived value.** One Postgres function, `resolve_customer_tier(p_customer_id uuid)`, reads `lifetime_spend` and the org's `client_tier_settings` and returns the tier. Everything calls it. `customer_loyalty.tier` stops being written and becomes vestigial (leave the column — do not drop it; `ClientPortalContext` and `LoyaltyProgramSettings` both select it today).

This kills all four hardcoded sites with one implementation and makes threshold edits take effect immediately.

---

## File Structure — Part 3

- Migration via Lovable (Task 3.1): `customer_loyalty.lifetime_spend`; backfill; widen `award_loyalty_points` to `AFTER INSERT OR UPDATE` and make it maintain `lifetime_spend`; add `resolve_customer_tier()`; stop writing `tier`
- Modify: `src/lib/loyaltyTier.ts` — accept org tiers, delete the hardcoded fallback
- Modify: `src/components/portal/LoyaltyTierBanner.tsx` — take resolved tier data as props
- Create: `src/hooks/useOrgTiers.ts` — fetch org tiers; **excluded from query persistence**
- Modify: `src/pages/portal/PortalDashboardPage.tsx` — supply tier data to banner + card
- Modify: `src/components/admin/LoyaltyProgramSettings.tsx` — delete `calculateTier`, stop writing `tier`, add `organization_id` to the bonus insert
- Modify: `src/components/admin/LoyaltyTierEditor.tsx` — audit first, then wire to `client_tier_settings`

---

### Task 3.1: Lovable prompt — `lifetime_spend`, the backfill correction, and derived tier

**Files:** migration via Lovable only. No local `supabase/` edits.

**Interfaces:**
- Produces: `customer_loyalty.lifetime_spend numeric(12,2)`; RPC `resolve_customer_tier(p_customer_id uuid) returns text`; RPC `get_org_tiers(p_organization_id uuid)` returning `(tier_name text, tier_order int, min_spending numeric, max_spending numeric, benefits jsonb, color text)`
- Consumed by: Tasks 3.2, 3.3, 3.4

- [ ] **Step 1: Capture the "before" state so the correction is measurable**

Ask Lovable to run and paste the output:

```sql
select count(*) filter (where coalesce(cl.lifetime_points,0) = 0) as at_zero_points,
       count(*)                                                   as total_loyalty_rows
from public.customer_loyalty cl;

-- customers whose completed-booking spend disagrees with their points
select count(*) as mismatched
from public.customer_loyalty cl
join (select customer_id, sum(total_amount) as spend
      from public.bookings where status = 'completed' group by customer_id) b
  on b.customer_id = cl.customer_id
where abs(coalesce(cl.lifetime_points,0) - b.spend) > 1;
```

`mismatched` is the number of customers currently at the wrong tier. Record it here — it is the evidence this task is a correction.

- [ ] **Step 2: Send the migration prompt to Lovable**

```
Please run a migration on the main project. Four changes, one transaction.

1. Add the monotonic lifetime-spend accumulator:

ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS lifetime_spend numeric(12,2) NOT NULL DEFAULT 0;

2. BACKFILL — this is a data CORRECTION, not housekeeping. Customers whose
   history was imported via process-migration-import currently have
   lifetime_points = 0 because award_loyalty_points is an AFTER UPDATE trigger
   and the importer INSERTs bookings already set to status='completed'. Those
   customers are sitting at the wrong tier today.

UPDATE public.customer_loyalty cl
SET lifetime_spend = coalesce(b.spend, 0),
    updated_at = now()
FROM (
  SELECT customer_id, sum(total_amount) AS spend
  FROM public.bookings
  WHERE status = 'completed' AND customer_id IS NOT NULL
  GROUP BY customer_id
) b
WHERE b.customer_id = cl.customer_id;

   Also create loyalty rows for completed-booking customers who have none:

INSERT INTO public.customer_loyalty (customer_id, organization_id, points, lifetime_points, lifetime_spend)
SELECT b.customer_id, max(bk.organization_id), 0, 0, sum(bk.total_amount)
FROM public.bookings bk
JOIN (SELECT DISTINCT customer_id FROM public.bookings WHERE status='completed' AND customer_id IS NOT NULL) b
  ON b.customer_id = bk.customer_id
WHERE bk.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM public.customer_loyalty cl WHERE cl.customer_id = b.customer_id)
GROUP BY b.customer_id;

3. Widen award_loyalty_points to fire on INSERT as well as UPDATE, and have it
   maintain lifetime_spend. Keep the existing 1-point-per-dollar behaviour for
   points. lifetime_spend must be INCREMENT-ONLY — never decrement it, on any
   path. Replace the tier-setting logic: STOP writing customer_loyalty.tier.
   Leave the tier column in place (other code still selects it), just stop
   maintaining it.

   The trigger must become:
     AFTER INSERT OR UPDATE ON public.bookings
   and award only when the row is newly completed:
     TG_OP = 'INSERT' AND NEW.status = 'completed'
     OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed')

4. Add two SECURITY DEFINER functions. Both must authorize the caller
   internally — do NOT grant either to `authenticated` without the check,
   since SECURITY DEFINER bypasses RLS.

   resolve_customer_tier(p_customer_id uuid) RETURNS text
     - resolves the customer's organization_id from public.customers
     - reads customer_loyalty.lifetime_spend
     - returns the tier_name from client_tier_settings where
       lifetime_spend >= min_spending AND (max_spending IS NULL OR
       lifetime_spend <= max_spending), highest tier_order wins
       (confirmed 2026-07-29: no org has overlapping ranges, so this
       tie-break is safe)
     - IMPORTANT: return NULL when lifetime_spend is below the org's LOWEST
       min_spending. Not every org starts a tier at $0. Do NOT fall back to
       the lowest tier — that would silently promote a customer who has not
       reached it. NULL means "no tier yet" and the UI renders nothing.
     - if the org has NO client_tier_settings rows, return the same four
       defaults get_loyalty_tier_info already falls back to
     - caller check: service_role, OR is_org_member(that organization_id)

   get_org_tiers(p_organization_id uuid) RETURNS TABLE
       (tier_name text, tier_order int, min_spending numeric,
        max_spending numeric, benefits jsonb, color text)
     - same body and same fallback as get_loyalty_tier_info
     - caller check: service_role OR is_org_member(p_organization_id)
     - GRANT EXECUTE TO authenticated (it authorizes internally)

Do NOT change client_tier_settings. Do NOT alter min_spending or
max_spending — 29 orgs set those deliberately.

Afterwards please paste:
  select count(*) as rows_with_spend, sum(lifetime_spend) as total_spend
  from public.customer_loyalty where lifetime_spend > 0;

Confirm the migration RAN, not just that a file was created.
```

- [ ] **Step 3: Verify the new columns and functions exist live**

```bash
U=https://slwfkaqczvwvvvavkgpr.supabase.co/rest/v1
# expect 200
curl -s -o /dev/null -w "lifetime_spend %{http_code}\n" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$U/customer_loyalty?select=lifetime_spend&limit=1"
# expect 401/42501 (exists but anon not authorized) — NOT 404
curl -s -w "\nget_org_tiers %{http_code}\n" -X POST -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_organization_id":"00000000-0000-0000-0000-000000000000"}' \
  "$U/rpc/get_org_tiers"
```

Expected: `200` for the column. For the RPC, `401`/`42501` proves it exists and authorizes; `404`/`PGRST202` means it was never created.

- [ ] **Step 4: Verify monotonicity cannot be violated**

Ask Lovable to confirm no path decrements it:

```sql
select count(*) as decrementing_refs
from pg_proc p
where p.prosrc ilike '%lifetime_spend%'
  and (p.prosrc ilike '%lifetime_spend =%-%' or p.prosrc ilike '%lifetime_spend - %');
```

Expected: `0`.

- [ ] **Step 5: Regenerate types and commit**

```bash
# Regenerate src/integrations/supabase/types.ts from the schema (do not hand-edit)
npx tsc --noEmit -p tsconfig.app.json
git add -A supabase/migrations/ src/integrations/supabase/types.ts
git commit -m "feat(loyalty): add monotonic lifetime_spend, backfill migrated history

The backfill is a correction: award_loyalty_points is AFTER UPDATE only, but
process-migration-import inserts bookings already marked completed, so every
migrated booking awarded zero points. Customers at 29 orgs were at the wrong
tier. Also adds resolve_customer_tier/get_org_tiers and stops writing the
denormalized customer_loyalty.tier."
```

---

### Task 3.2: `loyaltyTier.ts` — accept org tiers, delete the hardcoded fallback

**Files:**
- Modify: `src/lib/loyaltyTier.ts`
- Test: `src/lib/loyaltyTier.test.ts` (create)

**Interfaces:**
- Consumes: `get_org_tiers` shape from Task 3.1
- Produces: `computeTierProgress(lifetimeSpend: number, tiers: TierDef[]): TierProgress` — **`tiers` is now required**; `TierDef` becomes `{ name: string; minSpending: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/loyaltyTier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTierProgress, type TierDef } from './loyaltyTier';

const ORG_TIERS: TierDef[] = [
  { name: 'Starter', minSpending: 0 },
  { name: 'Regular', minSpending: 1200 },
  { name: 'VIP', minSpending: 4000 },
];

describe('computeTierProgress', () => {
  it('uses the org tiers it is given, not any built-in defaults', () => {
    const r = computeTierProgress(1500, ORG_TIERS);
    expect(r.current.name).toBe('Regular');
    expect(r.next?.name).toBe('VIP');
    expect(r.amountAway).toBe(2500);
  });

  it('reports the top tier with no next', () => {
    const r = computeTierProgress(9000, ORG_TIERS);
    expect(r.current.name).toBe('VIP');
    expect(r.next).toBeNull();
    expect(r.amountAway).toBe(0);
  });

  it('does not fall back to Bronze/Silver/Gold/Platinum for an unknown spend', () => {
    const r = computeTierProgress(0, ORG_TIERS);
    expect(r.current.name).toBe('Starter');
    expect(['Bronze', 'Silver', 'Gold', 'Platinum']).not.toContain(r.current.name);
  });

  it('throws rather than guessing when given no tiers', () => {
    expect(() => computeTierProgress(500, [])).toThrow(/no tiers/i);
  });

  // Not every org starts a tier at $0.
  const NO_ZERO_FLOOR: TierDef[] = [
    { name: 'Regular', minSpending: 200 },
    { name: 'VIP', minSpending: 1000 },
  ];

  it('returns no current tier when spend is below the lowest threshold', () => {
    const r = computeTierProgress(50, NO_ZERO_FLOOR);
    expect(r.current).toBeNull();
    expect(r.next?.name).toBe('Regular');
    expect(r.amountAway).toBe(150);
  });

  it('does not promote a below-threshold customer to the lowest tier', () => {
    expect(computeTierProgress(199, NO_ZERO_FLOOR).current).toBeNull();
    expect(computeTierProgress(200, NO_ZERO_FLOOR).current?.name).toBe('Regular');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/loyaltyTier.test.ts`
Expected: FAIL — `minSpending` does not exist on `TierDef`, `amountAway` does not exist on `TierProgress`, and the empty-array case returns Bronze instead of throwing.

- [ ] **Step 3: Rewrite `src/lib/loyaltyTier.ts`**

Replace the file's contents entirely:

```ts
// Loyalty tier progression helpers.
// Tiers are defined PER ORG in client_tier_settings, keyed on lifetime
// SPENDING (dollars). 29 orgs set those thresholds deliberately.
//
// There are deliberately NO default tiers here. A hardcoded fallback is what
// caused every org's portal to display TidyWise Cleaning's tiers. If the
// caller has no tiers yet, that is a loading or configuration state for the
// UI to handle — not something this module should paper over.

export interface TierDef {
  name: string;
  minSpending: number;
}

export interface TierProgress {
  /**
   * null when the customer's spend is BELOW the org's lowest threshold.
   * Not every org starts a tier at $0 — confirmed 2026-07-29 that thresholds
   * do not overlap, but NOT that a zero floor always exists. Returning the
   * lowest tier here would silently promote a customer who has not reached it.
   */
  current: TierDef | null;
  next: TierDef | null;
  /** Dollars still needed to reach `next`. 0 when already at the top tier. */
  amountAway: number;
}

export function computeTierProgress(
  lifetimeSpend: number,
  tiers: TierDef[],
): TierProgress {
  if (!tiers || tiers.length === 0) {
    throw new Error('computeTierProgress: no tiers supplied for this organization');
  }
  const sorted = [...tiers].sort((a, b) => a.minSpending - b.minSpending);

  // No zero-floor assumption: current stays null until a threshold is met.
  let current: TierDef | null = null;
  for (const t of sorted) if (lifetimeSpend >= t.minSpending) current = t;

  const next = current
    ? sorted.find(t => t.minSpending > current!.minSpending) ?? null
    : sorted[0];

  const amountAway = next ? Math.max(0, next.minSpending - lifetimeSpend) : 0;
  return { current, next, amountAway };
}
```

**The zero-floor case is a real state, not an edge case.** Thresholds were confirmed non-overlapping, but nothing confirms every org's lowest tier starts at `$0`. An org whose lowest tier begins at `$200` has customers below it who belong to no tier at all.

Handling, consistent everywhere:
- `computeTierProgress` returns `current: null` — never the lowest tier as a consolation.
- `next` still points at the lowest tier, so "spend $150 more to reach Regular" remains a useful message for a customer with no tier yet.
- The banner **renders nothing** when `current` is null and there is no meaningful progress message — same rule as the loading state: render nothing rather than guess.
- `resolve_customer_tier()` returns **NULL**, not the lowest tier name.
- Any UI showing a tier name must handle null by omitting the tier line, not by printing "Bronze", "None", or "—" as if it were a tier the org defined.

Note what is gone: `DEFAULT_TIERS`, `AVG_CLEAN_POINTS`, `cleansAway`, and `reachedTierJustNow`. The first is the bug. The rest were point-based heuristics with no spending equivalent — `cleansAway` divided by a guessed 150-point average clean. Task 3.3 replaces the copy that used them.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/lib/loyaltyTier.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Find every caller and let the compiler list them**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: errors in `src/components/portal/LoyaltyTierBanner.tsx` (fixed in Task 3.3). If any other file appears, note it here before continuing — the earlier survey found only that one caller, so a second means something changed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/loyaltyTier.ts src/lib/loyaltyTier.test.ts
git commit -m "refactor(loyalty): tier progress takes org tiers, drops hardcoded defaults

DEFAULT_TIERS caused every org's portal to show TidyWise Cleaning's four
tiers. Tiers are per-org in client_tier_settings, keyed on lifetime spending."
```

---

### Task 3.3: `useOrgTiers` hook + fix `LoyaltyTierBanner`

**Files:**
- Create: `src/hooks/useOrgTiers.ts`
- Modify: `src/components/portal/LoyaltyTierBanner.tsx`
- Modify: `src/pages/portal/PortalDashboardPage.tsx`
- Modify: `src/App.tsx` (persistence exclusion)
- Test: `tests/portal-tier-banner.spec.ts` (create)

**Interfaces:**
- Consumes: `get_org_tiers` (Task 3.1); `computeTierProgress` / `TierDef` (Task 3.2)
- Produces: `useOrgTiers(organizationId?: string)` → `{ tiers: TierDef[] | undefined; isLoading: boolean; error: unknown }`

- [ ] **Step 1: Write the failing test**

Create `tests/portal-tier-banner.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { loginToPortal } from './helpers/portal-auth';

test('tier banner shows the org tier names, never TidyWise defaults', async ({ page }) => {
  await loginToPortal(page);
  const banner = page.getByTestId('loyalty-tier-banner');
  await expect(banner).toBeVisible();
  // The test org (see tests/README.md) uses custom tier names.
  await expect(banner).not.toContainText(/Bronze|Silver|Gold|Platinum/);
});

test('banner renders nothing while tiers are loading — never a guessed tier', async ({ page }) => {
  await page.route('**/rpc/get_org_tiers', route => route.abort());
  await loginToPortal(page);
  await expect(page.getByTestId('loyalty-tier-banner')).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/portal-tier-banner.spec.ts --config=playwright.qa.config.ts`
Expected: FAIL — the banner has no `data-testid` and currently renders hardcoded tier names.

- [ ] **Step 3: Create the hook**

Create `src/hooks/useOrgTiers.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TierDef } from '@/lib/loyaltyTier';

/**
 * Loads this org's loyalty tiers from client_tier_settings via get_org_tiers.
 *
 * NOT persisted to the offline cache — see App.tsx. A stale tier threshold
 * would misreport a customer's status, the same reasoning that excludes
 * service-pricing from persistence.
 *
 * Errors are surfaced, never swallowed into an empty array: an empty tier
 * list is a real configuration state and must not be confused with a failure.
 */
export function useOrgTiers(organizationId?: string) {
  const q = useQuery({
    queryKey: ['org-tiers', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<TierDef[]> => {
      const { data, error } = await supabase.rpc('get_org_tiers', {
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []).map((r: { tier_name: string; min_spending: number }) => ({
        name: r.tier_name,
        minSpending: Number(r.min_spending),
      }));
    },
  });
  return { tiers: q.data, isLoading: q.isLoading, error: q.error };
}
```

- [ ] **Step 4: Exclude it from the persisted cache**

In `src/App.tsx`, find the existing `shouldDehydrateQuery` predicate that already excludes `service-pricing` and add `org-tiers` to the same exclusion list. Match the existing style exactly — do not restructure the predicate.

- [ ] **Step 5: Rewrite the banner**

Replace `src/components/portal/LoyaltyTierBanner.tsx`:

```tsx
import { Trophy, Sparkles } from 'lucide-react';
import { computeTierProgress, type TierDef } from '@/lib/loyaltyTier';

interface Props {
  lifetimeSpend: number;
  tiers: TierDef[] | undefined;
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function LoyaltyTierBanner({ lifetimeSpend, tiers }: Props) {
  // No tiers yet = still loading, or this org has none configured. Either way,
  // render nothing rather than guessing a tier.
  if (!tiers || tiers.length === 0) return null;

  const { current, next, amountAway } = computeTierProgress(lifetimeSpend, tiers);

  // Below the org's lowest threshold: no tier yet. Show the climb if there is
  // one, otherwise render nothing — never invent a tier the org didn't define.
  if (!current) {
    if (!next) return null;
    return (
      <div
        data-testid="loyalty-tier-banner"
        className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3"
      >
        <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <p className="font-semibold text-sm">
            {money(amountAway)} more to reach {next.name}
          </p>
          <p className="text-xs text-muted-foreground">Your rewards start there.</p>
        </div>
      </div>
    );
  }

  if (!next) {
    return (
      <div
        data-testid="loyalty-tier-banner"
        className="rounded-2xl border border-primary/40 bg-primary/10 p-4 flex items-center gap-3"
      >
        <Sparkles className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-sm">You're {current.name} — our top tier.</p>
          <p className="text-xs text-muted-foreground">Thanks for being one of our best customers.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="loyalty-tier-banner"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3"
    >
      <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
      <div>
        <p className="font-semibold text-sm">
          {money(amountAway)} more to reach {next.name}
        </p>
        <p className="text-xs text-muted-foreground">You're currently {current.name}.</p>
      </div>
    </div>
  );
}

export default LoyaltyTierBanner;
```

- [ ] **Step 6: Wire it up in the portal**

In `src/pages/portal/PortalDashboardPage.tsx`:

1. Add the import: `import { useOrgTiers } from '@/hooks/useOrgTiers';`
2. Inside the page component: `const { tiers } = useOrgTiers(user?.organization_id);`
3. Replace the banner usage at `:803`:

```tsx
<LoyaltyTierBanner
  lifetimeSpend={displayLoyalty.lifetime_spend ?? 0}
  tiers={tiers}
/>
```

4. `displayLoyalty` (`:557`) currently defaults `{ points: 0, lifetime_points: 0, tier: "bronze" }`. Add `lifetime_spend: 0` and **remove the `tier: "bronze"` default** — a hardcoded tier default is the same bug in miniature. `PortalLoyaltyCard` (Task 1.1) should render the tier from `resolve_customer_tier`, or omit the tier line when it is unknown.
5. Confirm `ClientPortalContext` supplies `lifetime_spend`; if it selects explicit columns, add it there too.

- [ ] **Step 7: Typecheck, lint, test**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npx playwright test tests/portal-tier-banner.spec.ts --config=playwright.qa.config.ts
```

Expected: all clean, 2 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useOrgTiers.ts src/components/portal/LoyaltyTierBanner.tsx \
        src/pages/portal/PortalDashboardPage.tsx src/App.tsx tests/portal-tier-banner.spec.ts
git commit -m "fix(loyalty): tier banner reads the org's own tiers

Every org's portal previously showed TidyWise Cleaning's hardcoded tiers.
Renders nothing while loading rather than guessing, and is excluded from the
offline cache so a stale threshold cannot misreport tier status."
```

---

### Task 3.4: Admin — stop writing a hardcoded tier, fix the bonus insert

**Files:**
- Modify: `src/components/admin/LoyaltyProgramSettings.tsx:88-143`
- Test: `tests/admin-bonus-points.spec.ts` (create)

**Interfaces:**
- Consumes: `resolve_customer_tier` (Task 3.1)
- Produces: nothing downstream

- [ ] **Step 1: Confirm the suspected RLS rejection before changing anything**

Open Admin → Loyalty, add bonus points to a test customer, watch the network tab. Record which happened:
- `42501` + "Failed to add bonus points" → the missing `organization_id` is confirmed; Step 3 fixes it.
- `201` + success → a permissive INSERT policy exists; the fix in Step 3 is still correct (defence in depth) but was not causing a failure.

Either way, note the result in `docs/bugs/2026-07-29-admin-bonus-points-button.md` and close that item.

- [ ] **Step 2: Write the failing test**

Create `tests/admin-bonus-points.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/admin-auth';

test('granting bonus points succeeds and records the org', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/loyalty');

  const insert = page.waitForResponse(r =>
    r.url().includes('/rest/v1/loyalty_transactions') && r.request().method() === 'POST');

  await page.getByTestId('loyalty-customer-row').first().click();
  await page.getByLabel(/bonus points/i).fill('50');
  await page.getByRole('button', { name: /add bonus/i }).click();

  const res = await insert;
  expect(res.status()).toBe(201);
  expect(JSON.parse(res.request().postData() ?? '{}')).toHaveProperty('organization_id');
  await expect(page.getByText(/bonus points added/i)).toBeVisible();
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx playwright test tests/admin-bonus-points.spec.ts --config=playwright.qa.config.ts`
Expected: FAIL — the POST body has no `organization_id` (and, if the policy rejects, status is 401 not 201).

- [ ] **Step 4: Fix the mutation**

In `src/components/admin/LoyaltyProgramSettings.tsx`, replace the `addBonusPoints` `mutationFn` body (`:89-125`) with:

```ts
mutationFn: async ({ customerId, points }: { customerId: string; points: number }) => {
  const { error: txError } = await supabase
    .from('loyalty_transactions')
    .insert({
      customer_id: customerId,
      organization_id: organizationId,
      points,
      transaction_type: 'bonus',
      description: 'Bonus points awarded by admin',
    });
  if (txError) throw txError;

  const { data: current, error: fetchError } = await supabase
    .from('customer_loyalty')
    .select('points, lifetime_points')
    .eq('customer_id', customerId)
    .single();
  if (fetchError) throw fetchError;

  // Tier is NOT written here. It is derived from lifetime_spend against the
  // org's client_tier_settings by resolve_customer_tier(). Bonus points are
  // not spending, so they must not move anyone's tier.
  const { error: updateError } = await supabase
    .from('customer_loyalty')
    .update({
      points: (current?.points || 0) + points,
      lifetime_points: (current?.lifetime_points || 0) + points,
    })
    .eq('customer_id', customerId);
  if (updateError) throw updateError;
},
```

- [ ] **Step 5: Delete `calculateTier`**

Remove `calculateTier` entirely (`:138-143`). It is the fourth hardcoded-threshold site. `npx tsc --noEmit -p tsconfig.app.json` will flag any remaining reference.

- [ ] **Step 6: Show the derived tier instead of the stored one**

Wherever this component displays a member's tier (it reads `tier` on the row type at `:19`), source it from `resolve_customer_tier` rather than `customer_loyalty.tier`. Leave the column selected if other code needs it, but do not render it — it is no longer maintained.

- [ ] **Step 7: Typecheck, lint, test**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npx playwright test tests/admin-bonus-points.spec.ts --config=playwright.qa.config.ts
```

Expected: all clean, test passes.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/LoyaltyProgramSettings.tsx tests/admin-bonus-points.spec.ts \
        docs/bugs/2026-07-29-admin-bonus-points-button.md
git commit -m "fix(loyalty): scope bonus-points insert to org, stop writing hardcoded tier

The insert omitted organization_id against an is_org_member WITH CHECK.
calculateTier hardcoded TidyWise's point thresholds and persisted a wrong
tier for the 29 orgs with custom spending thresholds; tier is now derived."
```

---

### Task 3.5: ~~Typed rule columns~~ — CUT

Not being built. See "Typed rule columns — CUT" above. No unread columns.

---

### Task 3.6: Per-org tier editor UI

**Files:**
- Modify: `src/components/admin/LoyaltyTierEditor.tsx` (exists — audit before extending)

- [ ] **Step 1: Audit what already exists**

```bash
wc -l src/components/admin/LoyaltyTierEditor.tsx
grep -n "client_tier_settings\|min_spending\|benefits\|tier_order" src/components/admin/LoyaltyTierEditor.tsx
grep -rn "LoyaltyTierEditor" src/ --include="*.tsx" | grep -v "LoyaltyTierEditor.tsx:"
```

Three outcomes, and they lead to different work:
- **Already reads and writes `client_tier_settings`** → this task is scoping and polish only. Verify it writes `min_spending` and `benefits` correctly and is reachable from the admin nav.
- **Reads it but is unreachable** (no importer) → wire it into the Loyalty settings page. That is the whole task.
- **Does not touch `client_tier_settings`** → it needs building against that table. Expand into full TDD steps at that point.

**Do not write a new editor before running this.** `LoyaltyTierEditor.tsx` was found in the initial survey and never opened; building a second one alongside it would repeat the three-review-tools duplication already recorded in this project's memory.

- [ ] **Step 2: Record the finding here, then expand this task accordingly**

Write the audit outcome into this plan before implementing, so the next reader knows which branch was taken.

Rationale for the split — this is the same argument as `organization_automations.settings` from the previous investigation, and it lands the other way here:

- `discount_percent` gets its **own typed column** with a `CHECK` constraint, because it is the one rule that touches money on every booking. A DB-level ceiling of 100 means no UI bug and no bad migration can ever produce a 500% discount. JSONB cannot give you that.
- `waive_fees text[]` is a small closed set of flags — an array is honest and queryable.
- `benefit_rules jsonb` holds the genuinely variable-shape rules (every-Nth counters, free-add-on value caps) that don't warrant columns yet.
- `benefits` (the existing display strings) **stays**, because three of your benefits are operational promises that only ever need to be displayed. Typed rules and display text are not the same thing and shouldn't be forced into one field.

This is deliberately *alongside* the display strings, not replacing them — you asked which, and the answer is alongside, because the untypeable benefits still need somewhere to live.

### The four hardcoded-tier sites — where each is fixed

`src/components/portal/LoyaltyTierBanner.tsx:10` calls `computeTierProgress(lifetimePoints, tier)` with no third argument, so it falls back to `DEFAULT_TIERS` (`loyaltyTier.ts:10-15`) — TidyWise Cleaning's four. Every other business's portal banner shows TidyWise's tier names.

That is one of four. Full list and owning task:

| Site | Reads or writes | Fixed by |
|---|---|---|
| `loyaltyTier.ts:10-15` `DEFAULT_TIERS` | display | Task 3.2 — deleted outright |
| `LoyaltyTierBanner.tsx:10` | display | Task 3.3 |
| `LoyaltyProgramSettings.tsx:138-143` `calculateTier` | **writes DB** (`:120`) | Task 3.4 — deleted |
| `award_loyalty_points` trigger `20251224071611:35-43` | **writes DB** | Task 3.1 — stops writing `tier` |

Per CLAUDE.md rule 5, every display fix must distinguish "still loading" from "no tiers configured" — never silently substitute a guess.

---

## Sequencing

Verification is complete, tier basis is decided, Part 2 is cut.

**Part 1 — straight removal.** Ship first, ships alone, no dependency on Part 3.
1. Task 1.1 — portal Redeem button + the `LoyaltyCard` remount fix
2. Task 1.2 — delete `redeem-loyalty-points` (confirm **undeployed**, not just deleted)
3. Task 1.4 — freeze `customers.credits`, export the 2 nonzero balances first
4. ~~Task 1.3~~ optional · ~~Task 1.5~~ skipped

**Part 3 — per-org tiers.**
5. **Task 3.1** — `lifetime_spend` + **the backfill correction** + widen `award_loyalty_points` to `AFTER INSERT OR UPDATE` + `resolve_customer_tier` / `get_org_tiers` + stop writing `tier` (Lovable)
6. **Task 3.2** — `src/lib/loyaltyTier.ts`: require org tiers, delete `DEFAULT_TIERS`
7. **Task 3.3** — `useOrgTiers` hook + fix `LoyaltyTierBanner`; exclude from persisted cache
8. **Task 3.4** — admin: add `organization_id` to the bonus insert, delete `calculateTier`
9. ~~Task 3.5~~ — **CUT.** No unread columns.
10. **Task 3.6** — per-org tier editor. **Audit `LoyaltyTierEditor.tsx` first** — it already exists.

~~Part 2~~ — cut. Gated behind `docs/security/2026-07-29-booking-price-authority.md`.

**Ordering:** 3.1 must land first — everything downstream needs `lifetime_spend` and the two RPCs. 3.2 before 3.3 (3.3 consumes the new signature). 3.4 and 3.6 can run in parallel with 3.2/3.3.

**Task 3.1 must not be deferred.** It carries the backfill, which corrects customers who are at the wrong tier *today* — not setup for a future feature.

---

## Self-Review

**Spec coverage:**
- Part 1 removal → Tasks 1.1, 1.2 ✅ (full TDD steps)
- Data disposition → decisions 1a–1c; 1a **skipped**, 1b → Task 1.4, 1c → Task 1.3 optional ✅
- Lifetime spending exists / needs deriving / where → "Lifetime spending" + Task 3.1 ✅
- Backfill framed as a correction, not housekeeping → dedicated ⚠️ subsection + Task 3.1 Steps 1–2 ✅
- Baseline caveat documented as accepted → "Accepted caveat on the baseline" ✅
- `client_tier_settings` suitability → Part 3, ships unchanged ✅
- `loyaltyTier.ts` + `LoyaltyTierBanner` fix → Tasks 3.2, 3.3 ✅
- Typed rule columns → **CUT** by decision (no unread columns) ✅
- Admin bonus-points button logged separately → `docs/bugs/2026-07-29-admin-bonus-points-button.md` ✅
- Which benefits automatable / price sites / failure mode / customer visibility → retained in the cut Part 2 as the record of why ✅
- Live verification → Verification Results + RESULTS RECEIVED ✅

**Scope changes, both deliberate and recorded:**
- **Part 2 cut.** "Applies automatically at booking time" and "customer sees the benefit applied" are **not delivered**. Benefits are displayed and honoured by hand. Blocker: `docs/security/2026-07-29-booking-price-authority.md`.
- **Task 3.5 cut.** No forward-looking rule columns — nothing would read them.

**Type consistency check:** `TierDef` changes from `{ name, minLifetimePoints }` to `{ name, minSpending }` in Task 3.2, and `TierProgress` drops `cleansAway` / `reachedTierJustNow` and adds `amountAway`. Task 3.3 consumes exactly those names. `resolve_customer_tier(p_customer_id uuid)` and `get_org_tiers(p_organization_id uuid)` are spelled identically in Tasks 3.1, 3.3, and 3.4. `lifetime_spend` (not `lifetime_spending`) throughout.

**Gaps I am flagging rather than hiding:**
- **Task 3.6 is deliberately not expanded into steps.** `LoyaltyTierEditor.tsx` exists and has never been opened; its audit (Step 1) determines whether the task is polish, wiring, or a build. Writing steps before that would be guessing.
- **Task 3.4 Step 1 is an empirical check, not code.** Whether the bonus-points insert is actually rejected depends on policy bodies I could not read (five policies, OR-combined). The fix is correct either way; the severity is not yet known.
- **Task 3.1's `resolve_customer_tier` needs a tie-break rule confirmed.** If an org's `min_spending` ranges overlap, "highest `tier_order` wins" is my assumption. Worth checking against the 29 orgs' actual data (query 7 output) before implementing.
- **Test helpers assumed:** `tests/helpers/portal-auth.ts` and `tests/helpers/admin-auth.ts` are referenced by the new specs. `tests/README.md` documents the existing org A/B fixtures — confirm the helper names match before writing the specs, and note the `storageState`-per-worker gotcha recorded there.

**Type consistency:** `resolve_tier_benefits(p_customer_id uuid)` is referenced consistently in Part 2 and Part 3. Snapshot columns (`tier_discount_amount`, `tier_name_applied`, `tier_discount_percent`, `tier_resolution_status`) are named identically in both places.

---

## Out of scope, but do not lose these

1. **Referral credits have the identical write-only defect.** `20260722214444:73` writes `customers.credits`; nothing reads it. Dropping loyalty redemption does not fix this. Referral customers are still being promised credit that no system honours.
2. **`redeem-loyalty-points` read two `business_settings` columns that do not exist**, and swallowed the error by destructuring only `data`. Worth grepping for the same pattern elsewhere — it turns a schema error into a silent default.
3. **`LoyaltyProgramSettings.tsx:91-98`** (admin "add bonus points") omits `organization_id`. Query 6 confirmed `loyalty_transactions` has an **INSERT policy using `is_org_member`** — and `is_org_member(NULL)` evaluates false, so that `WITH CHECK` should reject the insert with `42501`. **This button is probably broken in production.** The same query result that closed the visibility concern raises this one. Untested; worth 5 minutes with the button and the network tab.
   Separately, `:112` adds bonus points to `lifetime_points`, which is why that column cannot serve as a spend proxy (see Part 3).
4. **`bookings.discount_id` / the `discounts` table** already exist. Confirm a tier discount and a promo code can coexist, and decide whether they stack, before Part 2 ships.
