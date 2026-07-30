# Signup notification: "Plan: trial" is not a report, it's a swallowed error

**Investigated:** 2026-07-30. Read-only, nothing changed.
**Answers:** both questions — and they resolve differently, so this is **not** one fix.

---

## Q1 — Has the person chosen a plan when this fires? **No.**

The order is documented in the code itself, `ChoosePlanPage.tsx:119`:

> Flow: Signup → Onboarding → HERE → Stripe Checkout → /checkout/success → /dashboard

And the `organizations` row is created in **step 2**, `OnboardingPage.tsx:332-339`:

```ts
const { data, error } = await supabase
  .from('organizations')
  .insert({ name, owner_id: user.id, slug })   // no plan, no tier
  .select().single();
```

`notify_new_org_signup` is `AFTER INSERT ON public.organizations`, so the SMS goes out
at step 2 — **strictly before the plan is chosen at step 3.** There is genuinely
nothing to report about a plan at that moment.

**So your instinct is right: the fix for plan-and-price is a second notification on
conversion, not a change to this one.** The natural hook is
`stripe-subscription-webhook/index.ts:101`, which already resolves customer → owner →
organization and updates `plan_tier` — the exact moment the answer becomes knowable.

## Q2 — But this message is broken independently, and worse than "missing"

`notify-new-organization-signup/index.ts:59-66`:

```ts
const { data: orgData } = await supabase
  .from("organizations")
  .select("subscription_tier, subscription_status")
  .eq("id", org_id).maybeSingle();

const plan = orgData?.subscription_tier || "trial";
const status = orgData?.subscription_status || "trial";
```

**`organizations` has neither column.** Its full column list is:

```
country_code, created_at, grandfathered_at, grandfathered_lifetime, id, logo_url,
name, owner_id, plan_downgrade_date, plan_downgrade_scheduled_to, plan_tier,
plan_type, slug, stripe_schedule_id, updated_at
```

The subscription fields live on **`profiles`** (`subscription_status`,
`subscription_tier`, `trial_ends_at`) — confirmed by
`block_profile_subscription_self_update`, which guards exactly those two columns
`BEFORE UPDATE ON public.profiles`.

So that select returns `42703 undefined column`, PostgREST answers 400, and **the
`error` is never destructured**. `orgData` is null, `?.` yields undefined, and both
values fall back to `"trial"`.

`Plan: trial (trial)` is therefore not a description of anything. It is a constant
produced by a failing query, printed identically for every signup — and it would
print the same for a paying customer on Custom. Fixing the timing alone would not fix
this; the line is broken regardless of when it runs.

Same failure shape as the blank owner name: a silent failure rendering as a plausible
default. That is the real thread joining these two, not the notification itself.

### What the message builds vs what is actually available

| Message line | Source now | Actually available at that moment |
|---|---|---|
| `Business:` | `org_name` from trigger payload | ✅ correct |
| `Owner:` | `profiles.full_name` | ❌ NULL since 2026-02-01 — separate bug |
| `Email:` | `profiles.email` | ✅ correct |
| `Phone:` | `profiles.phone` | ❌ never populated — same root cause |
| `Plan:` | `organizations.subscription_tier` | ❌ **column does not exist** |
| `(status)` | `organizations.subscription_status` | ❌ **column does not exist** |
| — | — | ✅ `organizations.plan_tier` — `NOT NULL DEFAULT 'trial'` |
| — | — | ✅ owner's `profiles.subscription_status` — `'trial'` |
| — | — | ✅ owner's `profiles.trial_ends_at` — **`now() + 7 days`, set at signup** |

## Q3 — What you asked for, split by what is knowable when

> "Trial — Pro, $49/mo, ends 13 Aug"

**Available today, at signup:** the trial end date. `handle_new_user` sets
`trial_ends_at = NOW() + interval '7 days'` on the profile, so the signup SMS can
honestly say:

```
Plan: Trial (7-day) — ends Aug 13
```

That is a real improvement over `trial (trial)` and needs no new notification.

**Not available until conversion:** plan name and price. Prices come from
`ChoosePlanPage.tsx:30-63` and are frontend constants, not database values:

| id | name | monthly | yearly |
|---|---|---|---|
| `basic` | Basic | $49 | $490 |
| `pro` | Pro | $97 | $970 |
| `custom` | Custom | $197 | $1970 |

Note the `$49` you mentioned is **Basic**, not Pro.

⚠️ **Inconsistency worth checking before building on this:**
`validate_subscription_fields` (`20260716180500…sql:184`) rejects anything outside
`('starter', 'pro', 'business')`, but the plan ids in the UI are
`basic | pro | custom`. Two of three do not match. Either that trigger guards a
different column than I think, or one of the two lists is stale. **Resolve this before
writing plan names into a notification**, or the message will report a vocabulary
nothing else uses.

## Q4 — There are two notifications, on different channels, and only one is affected

| | `notify-platform-admin-signup` | `notify-new-organization-signup` |
|---|---|---|
| Channel | **Email** (Resend) | **SMS** (OpenPhone) + `admin_system_notifications` row |
| Fires | auth signup (step 1) | `organizations` INSERT (step 2) |
| Owner name from | `user.user_metadata.full_name` (JWT) `:76` | `profiles.full_name` `:52` |
| Blank-name bug? | **No — immune** | **Yes** |
| Plan reported? | No org exists yet | Broken, see Q2 |

**The email already has the name**, because it reads the JWT metadata the signup form
passed rather than the `profiles` row that `handle_new_user` never populated. So the
blank name you are seeing is specifically the **SMS and the in-app notification**.

No email version of the org-signup notification exists at all — if you want plan
details by email, that is a new sender, not an edit.

---

## So: one fix or two?

**Two, in different layers — but they can go to Lovable together.**

They meet in one function but have different causes:

1. **Blank owner name** → root cause is `handle_new_user` dropping `full_name` on
   2026-02-01. A **migration**. Already written:
   `docs/superpowers/prompts/2026-07-30-fix-blank-owner-name-signup.md`, including the
   backfill. Fixing it repairs the `Owner:` and `Phone:` lines in this SMS **with no
   change to the edge function at all**.
2. **Plan line** → an **edge function** change, and split further by timing: the
   trial-end date can be added now; plan name and price require a new
   conversion-time notification.

Sequencing that actually matters: **run the `handle_new_user` migration first.** It is
already queued, it repairs two lines of this message for free, and it means any later
test of the notification is not confounded by a blank name.

## Recommended shape, for when you want it built

**(a) Fix the plan line in the signup SMS** — edge function. Replace the nonexistent
columns with `organizations.plan_tier` plus the owner's `profiles.trial_ends_at`, and
**stop swallowing the error** so the next schema drift is loud rather than printing a
default. Target output:

```
Plan: Trial (7-day) — ends Aug 13
```

**(b) Add a conversion notification** — new, hooked into
`stripe-subscription-webhook` at `:101`, where tier is already resolved. That is the
one that can say `Converted — Pro, $97/mo`. Needs the naming inconsistency from Q3
settled first, and a decision on where prices live: hardcoding them in an edge
function to match `ChoosePlanPage` constants creates a second copy that will drift.
Reading the actual amount from the Stripe subscription object avoids that and is
truthful about what the customer was really charged — which matches the standing rule
that displayed money mirrors what the payer actually did.

Neither is written yet — reporting first as asked.

## Verification before building

`types.ts` is generated and can be stale (CLAUDE.md rule 4b), so confirm the column
list live rather than trusting the table above:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'organizations'
order by ordinal_position;

-- and the mismatch from Q3
select pg_get_functiondef('public.validate_subscription_fields()'::regprocedure);

select tgname, tgrelid::regclass as on_table
from pg_trigger
where tgfoid = 'public.validate_subscription_fields()'::regprocedure;

-- what tiers actually exist in the wild
select plan_tier, count(*) from public.organizations group by 1 order by 2 desc;
```

That last one is the quickest sanity check on the whole area: if every row still reads
`trial`, the Stripe webhook's `plan_tier` update is not landing either, and this is a
bigger problem than a notification string.
