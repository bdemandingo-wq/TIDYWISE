# Org-to-Org Referral Programme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A company that refers another company gets one month free, vested on the referred company's SECOND successful payment; the referred company gets 50% off their first month at signup; three referrals still in good standing when the third converts earns two additional months under the same vesting rule.

**Architecture:** A new `org_referrals` ledger, separate from the existing customer-to-customer `referrals` table. Attribution is captured client-side as a link/code but **written server-side only** by a `claim-referral` edge function, because the `organizations` INSERT policy does not enumerate columns. Vesting hooks the existing `invoice.paid` branch in `stripe-invoice-webhook` that already detects SaaS subscription invoices and already retrieves the Stripe charge (where the card fingerprint lives). Rewards are granted as a single 100%-off repeating Stripe coupon whose `duration_in_months` is recomputed from a months-owed ledger.

**Tech Stack:** Postgres/Supabase (RLS, triggers), Deno edge functions, Stripe (Checkout, coupons, webhooks), React + TypeScript frontend, `node:test` for pure logic.

## Global Constraints

- **Scope is upcoming signups on MONTHLY plans only.** The 79 `plan_type='lifetime'` orgs are grandfathered and out of scope on BOTH sides — they can neither earn nor redeem. Verified live: lifetime orgs carry `status='active'` with NULL `billing_interval` and NULL `stripe_price_id`.
- **`supabase/**` is Lovable's territory.** Every migration and edge-function change ships as a paste prompt ending in "deploy X, confirm deployed not committed". Never edit `supabase/` directly.
- **Never trust the client for attribution.** `organizations` INSERT policy is `(auth.uid() = owner_id)` with no column enumeration — an authenticated user can set any column on their own row. Precedent: `PublicBookingPage` deliberately routes `sms_consent` through a server endpoint for exactly this reason. (Cautionary note: that endpoint, `record-booking-consent`, was never built, so consent is recorded nowhere. Do not repeat that — the function must ship in the same change as the UI.)
- **Stripe permits ONE discount per subscription** unless multiple-discounts is enabled on the account. Rewards must be implemented by **recomputing a single coupon's `duration_in_months`**, never by applying several coupons. Confirm the account setting before Task 7.
- **Reward vests on the referred org's SECOND successful payment.** Never the first. Verified rationale: of the 13 fully-completed subscriptions in the only mature cohort, 3 (23%) never reached month 2.
- **Economics ceiling: ~$90 of giveaway per referral** at the observed mean lifetime of 2.84 months at $49/mo. The chosen structure spends $73.50. Do not raise either reward without redoing the arithmetic in `docs/superpowers/plans/` for this date.
- Money display must mirror what Stripe actually charges (repo convention).

---

## Spec — decisions locked before implementation

| Decision | Value | Why |
|---|---|---|
| Referrer reward | 1 month free (100% off, 1 period) | Fits the $90 budget alongside the referred discount |
| Referrer vesting | Referred org's **2nd** successful payment | Removes the 23% of payouts funding immediate churners |
| Referred reward | **50% off first month**, at signup | Gives the referred side a reason to act at half the cost of a full month |
| Bonus | 3 referrals in good standing when the 3rd converts → **2 additional** months | On top of the 3 already earned, not instead |
| Bonus vesting | Same rule — each of the 3 must have reached its 2nd payment | Otherwise 3 same-week signups that churn trigger $98 |
| Attribution | Link `?ref=CODE`, code as manual fallback | Link removes typos; code covers offline |
| Self-referral block | **Card fingerprint match** = hard reject | Only signal that is both stable across accounts and always present at reward time |
| Reward mechanism | 100%-off repeating coupon | Units are months, so it survives plan changes; already parsed by `billing-backfill` into `billing_subscription_periods.discount_percent` |
| Eligibility | `plan_type NOT IN ('lifetime')` on both sides | Lifetime orgs have no monthly bill |

**"Good standing"** = the referred org's subscription status is `active` or `trialing` AND it has reached its 2nd successful payment AND the referral is not `rejected`.

**"Successful payment"** = an `invoice.paid` event for that subscription where `amount_paid > 0`. Deliberately NOT `billing_reason === 'subscription_create'`: with the 7-day trial, Stripe issues a $0 invoice at creation and the first real charge arrives as `subscription_cycle`. Counting paid invoices with a positive amount is robust to trials either way.

---

## File Structure

**Mine (`src/`, committed and pushed by me):**
- `src/lib/referralCode.ts` — code generation + normalisation. Pure, no imports.
- `src/lib/referralCode.test.ts` — node:test
- `src/lib/referralEligibility.ts` — self-referral detection, good-standing, bonus threshold, months-owed arithmetic. Pure.
- `src/lib/referralEligibility.test.ts` — node:test
- `src/components/settings/ReferralPanel.tsx` — link, code, status list
- `src/hooks/useReferrals.ts` — react-query read hook
- `src/lib/referralAttribution.ts` — reads `?ref=` and persists it for the signup flow

**Lovable's (`supabase/`, shipped as paste prompts):**
- Migration: `org_referral_codes`, `org_referrals`, `org_referral_credits`, `org_referral_bonuses`
- `supabase/functions/_shared/referral-eligibility.ts` — verbatim copy of the src lib (KEEP IN SYNC pattern, same as `automation-templates.ts` and `phone.ts`)
- `supabase/functions/claim-referral/index.ts` — new
- `supabase/functions/grant-referral-reward/index.ts` — new, the coupon reconciler
- `supabase/functions/create-subscription/index.ts` — edit, apply the 50% first-month discount
- `supabase/functions/stripe-invoice-webhook/index.ts` — edit, payment counting + vesting

---

## Task 1: Referral code generation

**Files:**
- Create: `src/lib/referralCode.ts`
- Test: `src/lib/referralCode.test.ts`

**Interfaces:**
- Produces: `generateReferralCode(seed: string): string`, `normalizeReferralCode(raw: string | null | undefined): string | null`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReferralCode, generateReferralCode } from './referralCode.ts';

test('normalisation makes typed codes forgiving', () => {
  for (const v of ['abc123', 'ABC123', ' abc-123 ', 'abc 123']) {
    assert.equal(normalizeReferralCode(v), 'ABC123');
  }
});

test('CONTROL: a different code stays distinct', () => {
  // Without this, a normaliser returning a constant passes every case above
  // and every org would resolve to the same referrer.
  assert.notEqual(normalizeReferralCode('ABC123'), normalizeReferralCode('ABC124'));
});

test('ambiguous characters are excluded from generated codes', () => {
  // O/0 and I/1 are the classic mis-typings when a code is read aloud.
  for (let i = 0; i < 200; i++) {
    assert.doesNotMatch(generateReferralCode(`seed-${i}`), /[O0I1]/);
  }
});

test('unusable input has no code', () => {
  for (const v of [null, undefined, '', '   ', '--']) {
    assert.equal(normalizeReferralCode(v), null);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/referralCode.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Write minimal implementation**

```ts
/** Unambiguous alphabet: no O/0, no I/1 — codes get read aloud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length === 0 ? null : cleaned;
}

export function generateReferralCode(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    out += ALPHABET[Math.abs(h) % ALPHABET.length];
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/referralCode.test.ts`
Expected: PASS, 4/4

- [ ] **Step 5: Commit**

```bash
git add src/lib/referralCode.ts src/lib/referralCode.test.ts
git commit -m "feat: referral code generation and forgiving normalisation"
```

---

## Task 2: Eligibility and vesting logic

**Files:**
- Create: `src/lib/referralEligibility.ts`
- Test: `src/lib/referralEligibility.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type ReferralParty = { orgId: string; ownerId: string; planType: string | null; cardFingerprint: string | null }`
  - `rejectReason(referrer: ReferralParty, referred: ReferralParty): string | null`
  - `isVested(paidInvoiceCount: number): boolean`
  - `isInGoodStanding(r: { status: string; paidInvoiceCount: number; subscriptionStatus: string }): boolean`
  - `bonusMonthsOwed(goodStandingCount: number, bonusAlreadyGranted: boolean): number`
  - `monthsOwed(granted: number, redeemed: number): number`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rejectReason, isVested, isInGoodStanding, bonusMonthsOwed, monthsOwed,
} from './referralEligibility.ts';

const party = (o: Partial<any> = {}) => ({
  orgId: 'org-a', ownerId: 'user-a', planType: 'basic', cardFingerprint: 'fp-a', ...o,
});

test('same card on both sides is rejected', () => {
  assert.equal(
    rejectReason(party(), party({ orgId: 'org-b', ownerId: 'user-b', cardFingerprint: 'fp-a' })),
    'self_referral_card',
  );
});

test('same owner on both sides is rejected', () => {
  assert.equal(
    rejectReason(party(), party({ orgId: 'org-b', cardFingerprint: 'fp-b' })),
    'self_referral_owner',
  );
});

test('an org cannot refer itself', () => {
  assert.equal(rejectReason(party(), party()), 'self_referral_same_org');
});

test('lifetime orgs are out of scope on both sides', () => {
  assert.equal(
    rejectReason(party({ planType: 'lifetime' }), party({ orgId: 'org-b', ownerId: 'user-b', cardFingerprint: 'fp-b' })),
    'referrer_not_monthly',
  );
  assert.equal(
    rejectReason(party(), party({ orgId: 'org-b', ownerId: 'user-b', cardFingerprint: 'fp-b', planType: 'lifetime' })),
    'referred_not_monthly',
  );
});

test('CONTROL: a genuine pair is accepted', () => {
  // Without this, a rejectReason that rejected everything would pass every
  // assertion above and the programme would never pay out.
  assert.equal(
    rejectReason(party(), party({ orgId: 'org-b', ownerId: 'user-b', cardFingerprint: 'fp-b' })),
    null,
  );
});

test('a null fingerprint never matches another null', () => {
  // Two orgs that have not paid yet both have null. Treating that as a match
  // would reject every referral before the first payment.
  assert.equal(
    rejectReason(
      party({ cardFingerprint: null }),
      party({ orgId: 'org-b', ownerId: 'user-b', cardFingerprint: null }),
    ),
    null,
  );
});

test('vesting requires the SECOND payment', () => {
  assert.equal(isVested(0), false);
  assert.equal(isVested(1), false);   // the loophole this closes
  assert.equal(isVested(2), true);
  assert.equal(isVested(5), true);
});

test('good standing needs an active subscription AND vesting', () => {
  const base = { status: 'qualified', paidInvoiceCount: 2, subscriptionStatus: 'active' };
  assert.equal(isInGoodStanding(base), true);
  assert.equal(isInGoodStanding({ ...base, subscriptionStatus: 'canceled' }), false);
  assert.equal(isInGoodStanding({ ...base, paidInvoiceCount: 1 }), false);
  assert.equal(isInGoodStanding({ ...base, status: 'rejected' }), false);
});

test('the bonus pays two months, once, at the third good-standing referral', () => {
  assert.equal(bonusMonthsOwed(2, false), 0);
  assert.equal(bonusMonthsOwed(3, false), 2);
  assert.equal(bonusMonthsOwed(6, false), 2);   // one-time, not per-three
  assert.equal(bonusMonthsOwed(3, true), 0);    // already granted
});

test('months owed never goes negative', () => {
  assert.equal(monthsOwed(3, 1), 2);
  assert.equal(monthsOwed(1, 1), 0);
  assert.equal(monthsOwed(1, 5), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/referralEligibility.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ReferralParty {
  orgId: string;
  ownerId: string;
  planType: string | null;
  cardFingerprint: string | null;
}

const MONTHLY_EXCLUDED = new Set(['lifetime']);

/** Null when the pair is acceptable; otherwise the machine-readable reason. */
export function rejectReason(referrer: ReferralParty, referred: ReferralParty): string | null {
  if (referrer.orgId === referred.orgId) return 'self_referral_same_org';
  if (referrer.ownerId && referrer.ownerId === referred.ownerId) return 'self_referral_owner';
  // Both null means "neither has paid yet", NOT a match.
  if (
    referrer.cardFingerprint &&
    referrer.cardFingerprint === referred.cardFingerprint
  ) return 'self_referral_card';
  if (MONTHLY_EXCLUDED.has(referrer.planType ?? '')) return 'referrer_not_monthly';
  if (MONTHLY_EXCLUDED.has(referred.planType ?? '')) return 'referred_not_monthly';
  return null;
}

/** The whole anti-abuse design in one line: the SECOND payment, never the first. */
export function isVested(paidInvoiceCount: number): boolean {
  return paidInvoiceCount >= 2;
}

export function isInGoodStanding(r: {
  status: string; paidInvoiceCount: number; subscriptionStatus: string;
}): boolean {
  if (r.status === 'rejected' || r.status === 'expired') return false;
  if (!isVested(r.paidInvoiceCount)) return false;
  return r.subscriptionStatus === 'active' || r.subscriptionStatus === 'trialing';
}

const BONUS_THRESHOLD = 3;
const BONUS_MONTHS = 2;

export function bonusMonthsOwed(goodStandingCount: number, bonusAlreadyGranted: boolean): number {
  if (bonusAlreadyGranted) return 0;
  return goodStandingCount >= BONUS_THRESHOLD ? BONUS_MONTHS : 0;
}

export function monthsOwed(granted: number, redeemed: number): number {
  return Math.max(0, granted - redeemed);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/referralEligibility.test.ts`
Expected: PASS, 10/10

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
git add src/lib/referralEligibility.ts src/lib/referralEligibility.test.ts
git commit -m "feat: referral eligibility, vesting and bonus arithmetic"
git push origin main   # Lovable's mirror needs it before the _shared copy is made
```

---

## Task 3: Schema (Lovable paste)

**Files:**
- Migration via Lovable. No local file.

Four tables. All RLS-enabled, all org-scoped, **none client-writable**.

- [ ] **Step 1: Write the migration into a paste prompt**

```sql
-- The referrer's shareable code. Client may READ its own; never write.
create table if not exists public.org_referral_codes (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- The ledger. One row per attributed signup.
create table if not exists public.org_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  referrer_org_id uuid not null references public.organizations(id) on delete cascade,
  referred_org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','qualified','rewarded','rejected','expired')),
  rejection_reason text,
  referred_paid_invoice_count integer not null default 0,
  referred_first_payment_at timestamptz,
  referred_second_payment_at timestamptz,
  referrer_reward_granted_at timestamptz,
  referred_card_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One referral per referred org, ever. This is the atomic guard against
  -- an org being claimed twice; a read-then-write check cannot close it.
  constraint org_referrals_referred_once unique (referred_org_id)
);

create index if not exists org_referrals_referrer_status_idx
  on public.org_referrals (referrer_org_id, status);

-- Months owed vs redeemed. Stripe allows ONE discount per subscription, so the
-- coupon is recomputed from this rather than stacked.
create table if not exists public.org_referral_credits (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  months_granted integer not null default 0,
  months_redeemed integer not null default 0,
  active_coupon_id text,
  updated_at timestamptz not null default now(),
  constraint months_non_negative check (months_granted >= 0 and months_redeemed >= 0)
);

-- One-time bonus audit.
create table if not exists public.org_referral_bonuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  months integer not null,
  qualifying_referral_ids uuid[] not null,
  granted_at timestamptz not null default now(),
  constraint org_referral_bonus_once unique (organization_id)
);

alter table public.org_referral_codes  enable row level security;
alter table public.org_referrals       enable row level security;
alter table public.org_referral_credits enable row level security;
alter table public.org_referral_bonuses enable row level security;

-- Read-only for members of the owning org. No INSERT/UPDATE/DELETE policies at
-- all: every write goes through an edge function on the service role, because
-- the organizations INSERT policy does not enumerate columns and a client that
-- can write attribution can forge it.
create policy "members read own referral code" on public.org_referral_codes
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referral_codes.organization_id
                   and m.user_id = auth.uid()));

create policy "members read own referrals" on public.org_referrals
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referrals.referrer_org_id
                   and m.user_id = auth.uid()));

create policy "members read own credits" on public.org_referral_credits
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referral_credits.organization_id
                   and m.user_id = auth.uid()));

create policy "members read own bonuses" on public.org_referral_bonuses
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referral_bonuses.organization_id
                   and m.user_id = auth.uid()));
```

- [ ] **Step 2: Backfill codes for existing monthly orgs**

```sql
insert into public.org_referral_codes (organization_id, code)
select o.id, upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8))
from public.organizations o
where o.plan_type is distinct from 'lifetime'
on conflict (organization_id) do nothing;
```

Report the row count. Expect ~16 (96 orgs minus 80 lifetime).

- [ ] **Step 3: Verify live, do not trust the migration file**

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.org_referrals'::regclass;
```
Expected: `org_referrals_referred_once UNIQUE (referred_org_id)` present.

- [ ] **Step 4: Commit the prompt**

---

## Task 4: Attribution capture

**Files:**
- Create: `src/lib/referralAttribution.ts`
- Modify: `src/pages/OnboardingPage.tsx` (after the org insert at ~:363-372)
- Lovable: `supabase/functions/claim-referral/index.ts`

**Interfaces:**
- Consumes: `normalizeReferralCode` (Task 1)
- Produces: `captureReferralFromUrl(search: string): void`, `readCapturedReferral(): string | null`

- [ ] **Step 1: Capture the code on landing**

```ts
import { normalizeReferralCode } from './referralCode.ts';

const KEY = 'tw-referral-code';

/** Persist ?ref= so it survives the signup journey. Never overwrite an
 *  existing capture — first touch wins, which is the attribution rule. */
export function captureReferralFromUrl(search: string): void {
  const code = normalizeReferralCode(new URLSearchParams(search).get('ref'));
  if (!code) return;
  if (localStorage.getItem(KEY)) return;
  localStorage.setItem(KEY, code);
}

export function readCapturedReferral(): string | null {
  return normalizeReferralCode(localStorage.getItem(KEY));
}
```

- [ ] **Step 2: Call `claim-referral` after the org exists**

In `OnboardingPage.tsx`, after `orgData` is confirmed and the membership is created:

```ts
// Attribution is recorded SERVER-side. The client passes the code and nothing
// else — it cannot name the referrer, set the status, or grant anything.
const capturedCode = readCapturedReferral();
if (capturedCode) {
  const { error: refErr } = await supabase.functions.invoke('claim-referral', {
    body: { organization_id: orgData.id, referral_code: capturedCode },
  });
  // Non-fatal: a failed claim must never block onboarding.
  if (refErr) console.error('[referral] claim failed:', refErr);
}
```

- [ ] **Step 3: `claim-referral` edge function (Lovable paste)**

Service role. Resolves the code → referrer org, runs `rejectReason` with the fingerprints known so far (both usually null at signup — that is expected and must NOT reject), and inserts `org_referrals` with `status='pending'`. Relies on `org_referrals_referred_once` to make double-claiming a `23505` rather than a race.

- [ ] **Step 4: Verify** — sign up via `?ref=`, confirm one `pending` row and that a second claim for the same org returns `already_claimed`, not a second row.

- [ ] **Step 5: Commit**

---

## Task 5: The referred org's 50% first month

**Files:**
- Lovable: `supabase/functions/create-subscription/index.ts` (~:229-247)

- [ ] **Step 1: Create the standing coupon in Stripe**

One reusable coupon: `percent_off: 50, duration: 'once'`. Record its id as the `REFERRED_FIRST_MONTH_COUPON` secret.

- [ ] **Step 2: Apply it when the org has a pending referral**

In `create-subscription`, before `checkout.sessions.create`, look up `org_referrals` for a `pending`/`qualified` row on this org. If present, add to the session:

```ts
discounts: [{ coupon: Deno.env.get('REFERRED_FIRST_MONTH_COUPON') }],
```

`duration: 'once'` means it applies to the first invoice only — which is the promise. Do NOT combine with `trial_period_days` removal; the trial stays as it is.

- [ ] **Step 3: Verify** — a referred signup's first Stripe invoice shows 50% off; a non-referred signup shows none. **Both halves required**: a discount applied to everyone looks identical to a working feature on the first test alone.

- [ ] **Step 4: Commit**

---

## Task 6: Payment counting and vesting

**Files:**
- Lovable: `supabase/functions/stripe-invoice-webhook/index.ts`, inside the existing `invoice.paid` branch at ~:893

This branch is already the right place: it already gates on `combined.purpose === "tidywise_saas_subscription" || inv.subscription`, and it already retrieves `pi` and `charge`.

- [ ] **Step 1: Count only real payments**

```ts
// A trialing subscription produces a $0 invoice at creation, so
// billing_reason cannot distinguish "first real payment". Amount can.
if (!inv.subscription || (inv.amount_paid ?? 0) <= 0) {
  // not a paid subscription invoice; skip referral processing
} else {
  // increment org_referrals.referred_paid_invoice_count for this org
}
```

- [ ] **Step 2: Record the card fingerprint on the first payment**

`charge` is already fetched. Read `(charge?.payment_method_details as any)?.card?.fingerprint` and write it to `org_referrals.referred_card_fingerprint`. Then re-run `rejectReason` — this is the point at which a self-referral becomes detectable, because it is the first moment a card exists.

- [ ] **Step 3: Vest on the second payment**

When the incremented count reaches 2 and `rejectReason` returns null, set `status='qualified'`, stamp `referred_second_payment_at`, and invoke `grant-referral-reward` for the **referrer**.

- [ ] **Step 4: Verify with both halves**
  - Referred org's 1st payment → count 1, status still `pending`, **no coupon on the referrer**
  - Referred org's 2nd payment → count 2, status `qualified`, referrer credited
  - **Control:** an org that cancels after one payment must never credit its referrer

- [ ] **Step 5: Commit**

---

## Task 7: Granting the reward

**Files:**
- Lovable: `supabase/functions/grant-referral-reward/index.ts`

- [ ] **Step 1: Confirm the Stripe single-discount constraint** on this account before writing anything. If multiple discounts are enabled, this task simplifies to appending a coupon; if not, the ledger below is required.

- [ ] **Step 2: Reconcile months into ONE coupon**

```
months = monthsOwed(credits.months_granted, credits.months_redeemed)
if months <= 0 -> nothing to do
create coupon { percent_off: 100, duration: 'repeating', duration_in_months: months }
apply to the referrer's subscription, replacing any prior referral coupon
store coupon id on org_referral_credits.active_coupon_id
```

- [ ] **Step 3: Track redemption** — in the same `invoice.paid` branch, when an invoice carries a 100% referral discount, increment `months_redeemed`.

- [ ] **Step 4: Skip lifetime referrers** — they have no subscription to discount. Set `status='rewarded'` with a note rather than erroring.

- [ ] **Step 5: Verify** — referrer's next invoice is $0; the one after returns to full price.

- [ ] **Step 6: Commit**

---

## Task 8: The three-referral bonus

**Files:**
- Lovable: `grant-referral-reward/index.ts` (extend)

- [ ] **Step 1: Count good standing at the moment the third converts**

Use `isInGoodStanding` per referral, then `bonusMonthsOwed(count, bonusAlreadyGranted)`. Re-evaluate at **every** vesting event, not once — a referral can fall out of good standing before the third arrives.

- [ ] **Step 2: Grant two months, once**

Insert `org_referral_bonuses` (unique on `organization_id` makes it one-time atomically), add 2 to `months_granted`, re-run the Task 7 reconciler.

- [ ] **Step 3: Verify**
  - 3 vested + active referrals → +2 months, one `org_referral_bonuses` row
  - 3 vested but one cancelled → **no bonus**
  - A 4th, 5th, 6th referral → still no second bonus

- [ ] **Step 4: Commit**

---

## Task 9: The UI

**Files:**
- Create: `src/hooks/useReferrals.ts`, `src/components/settings/ReferralPanel.tsx`
- Modify: `src/pages/admin/SettingsPage.tsx`

- [ ] **Step 1: Read hook** — react-query, key `['referrals', organizationId]`. **No `Map`/`Set` in the result** (repo rule 1 — the query cache is persisted to localStorage and `JSON.stringify` flattens them).
- [ ] **Step 2: Panel** — shareable link `https://jointidywise.com/?ref=CODE`, copy button, the code beneath it, and a list of referrals with status. Show months earned and months remaining.
- [ ] **Step 3: Hide for lifetime orgs** — they cannot earn or redeem; show nothing rather than a broken promise.
- [ ] **Step 4: Verify** — panel renders for a monthly org, absent for a lifetime org.
- [ ] **Step 5: Typecheck, lint, commit**

---

## Self-Review

**Spec coverage:** two-sided ✓ (T5 referred, T7 referrer); vesting on 2nd payment ✓ (T6); bonus additive and same vesting ✓ (T8); monthly-only scope ✓ (T2 `rejectReason`, T9 UI); attribution ✓ (T4); self-referral ✓ (T2 + T6 fingerprint).

**Known gaps, stated rather than hidden:**
1. **Fingerprint arrives late.** Both parties are usually fingerprint-null at signup, so self-referral can only be caught at the referred org's first payment (T6 Step 2). That is early enough — vesting is at the second — but it means `claim-referral` cannot reject on card at claim time, and the test in Task 2 pins that null≠null.
2. **Redemption tracking (T7 Step 3) is the most fragile part.** If a 100%-off invoice is missed, `months_redeemed` drifts and the org keeps a coupon it has spent. Worth a reconciliation query before launch.
3. The economics assume $49/mo and 2.84 mean paid months from 13 completed subscriptions. Small sample; revisit once the current cohort matures.
