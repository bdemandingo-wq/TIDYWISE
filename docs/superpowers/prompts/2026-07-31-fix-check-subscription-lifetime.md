# Lovable prompt — grandfathered and comped orgs are locked out of the web app

**Status:** ready to paste. One message, covers diagnosis and fix together.
**Trigger:** Golden Room Cleaning — `grandfathered_lifetime = true`, `plan_type =
'lifetime'`, `plan_tier = 'custom'`, plus a live `comped_access` row through
2026-08-23 — is still bounced to `/pricing`.

---

## The finding, before the prompt

**The committed source honours all three.** `check-subscription/index.ts` has the
grandfathered branch at Step 0 (`:117-156`) and the comped branch at Step 0.5
(`:158-191`), both *before* it ever asks Stripe. If the deployed function matched
git, Golden Room would be let in at Step 0 and never reach the paywall.

**Those two branches landed seven weeks apart** — grandfathered in `0c9c3ad4`
(1 June), comped in `c8c36bc4` / `e3e00c83` (23 July). Both are failing at once.
Two independent code paths, written at different times, reading different tables,
do not usually break simultaneously. The single explanation that covers both is
that **neither is deployed** — the live function predates 1 June.

That is CLAUDE.md's most expensive documented lesson, and it has happened to this
exact class of function before: on 2026-06-13 `create-subscription` had
`trial_period_days: 7` committed while live checkout still charged immediately,
because the deployed copy was stale. A git push changes files, not deployments.

### Why this is worse than one locked-out customer

With a pre-1-June function live, the only branches that can return
`subscribed: true` are the two hardcoded free emails, the `@tidywise1.com`
domain, and a real active Stripe subscription. Everything else falls through to
the org-trial branch — and **that branch can no longer grant access to anyone**:

- orgs created **on/after 2026-04-06** are excluded by `TRIAL_CUTOFF_DATE`
- orgs created **before 2026-04-06** are now more than 60 days old
  (2026-04-06 + 60 days = 2026-06-05, and today is 2026-07-31)

So every grandfathered org and every comped org is currently locked out of the
web app, and has been since at latest 5 June. Roughly 78 orgs were granted
lifetime without payment. The queries at the end size it exactly.

### A second, independent bug in the same file

Both lookups discard their error:

```ts
const { data: gfMembership } = await supabaseClient…   // :133  no `error`
const { data: comp } = await supabaseClient…           // :168  no `error`
```

If either query fails — bad filter, permission, anything — `data` is null, the
branch silently evaluates false, and the user is quietly downgraded to
"no access" with nothing in the logs to say why. That is CLAUDE.md rule 5, and it
means a redeploy alone could leave this failing *silently* for a different reason.
Fix both regardless of what the redeploy shows.

Also, both membership lookups use `.limit(1)` with **no `.order()`** (`:138`,
`:164`) — CLAUDE.md rule 3. For an owner who belongs to more than one org,
Postgres may return either row, so access can differ between two calls with no
change in data. Step 0.5 in particular can pick an org that has no comp while a
sibling org does.

---

## The prompt

````
Please fix and REDEPLOY the check-subscription edge function on the main project
(slwfkaqczvwvvvavkgpr).

THE PROBLEM: Golden Room Cleaning has organizations.grandfathered_lifetime = true,
plan_type = 'lifetime', AND a live comped_access row expiring 2026-08-23, and is
still bounced to /pricing by the AdminRoute paywall. That means
check-subscription is returning subscribed:false for them.

The committed source already handles both cases — the lifetime/grandfathered
branch at Step 0 and the comped branch at Step 0.5, both before the Stripe call.
So the deployed copy is almost certainly older than the committed one. The
grandfathered branch was added 2026-06-01 and the comped branch 2026-07-23, and
both are failing at the same time, which points at the deployment rather than at
either branch.

STEP 1 — TELL ME WHAT IS ACTUALLY DEPLOYED.
Before changing anything, please report the currently deployed version of
check-subscription: its last deployment timestamp, and whether the deployed body
contains the strings "grandfathered_lifetime" and "comped_access". If it does not
contain them, that confirms the diagnosis and the redeploy alone fixes it.

STEP 2 — THREE CODE FIXES, then redeploy.

(a) STOP SWALLOWING THE ERRORS. Two queries destructure only `data`:

      const { data: gfMembership } = await supabaseClient…   // ~line 133
      const { data: comp } = await supabaseClient…           // ~line 168

    Capture `error` on both and logStep it. A failed lookup currently looks
    identical to "this user has no lifetime access", which is how a paywall
    lockout can happen with nothing in the logs. Do NOT make the function throw
    on these errors — just log them loudly and continue to the next branch.

(b) ADD THE MISSING .order() . Both membership lookups use .limit(1) with no
    ordering (~line 138 and ~line 164), so for an owner in more than one org
    Postgres may return either row. Add a deterministic order, e.g.
    .order('created_at', { ascending: true }) on both.

    On the comped lookup (Step 0.5) this matters twice over: picking the wrong
    membership means checking comped_access for an org that has no comp while a
    sibling org does. If it is straightforward, prefer checking comped_access
    across ALL of the user's owner/admin/manager memberships rather than only the
    first one — an active comp on any of their orgs should grant access.

(c) HONOUR revoked_at ON COMPED ACCESS. The comped query filters only on
    expires_at:

      .eq("organization_id", …).gt("expires_at", now)

    The database function has_active_subscription also requires
    `revoked_at IS NULL`. As written, a comp that has been REVOKED but not yet
    expired still grants frontend access. Add .is('revoked_at', null) to match.

STEP 3 — REDEPLOY and confirm it is DEPLOYED, not just committed.

DO NOT change any of the following in this task — I want them decided separately,
not altered as a side effect:
  - the past_due handling (the function blocks past_due; has_active_subscription
    grants it — a real divergence, but changing it is a billing decision)
  - TRIAL_DURATION_DAYS (currently 60)
  - TRIAL_CUTOFF_DATE (currently 2026-04-06)
  - the free-account email list

AFTERWARDS please paste the results of these read-only queries:

  -- 1. HOW MANY ORGS ARE EXPOSED. These are orgs that the DATABASE considers
  --    entitled (has_active_subscription = true) but which have no active
  --    Stripe subscription — i.e. the population that depends entirely on the
  --    lifetime / grandfathered / comped branches working.
  select count(*) as entitled_without_stripe
  from public.organizations o
  where public.has_active_subscription(o.id)
    and not exists (
      select 1 from public.stripe_subscriptions s
      where s.organization_id = o.id
        and s.status in ('active','trialing')
    );

  -- 2. The breakdown, so I know who to tell.
  select
    count(*) filter (where o.grandfathered_lifetime)         as grandfathered,
    count(*) filter (where o.plan_type = 'lifetime')         as plan_type_lifetime,
    count(*) filter (where exists (
      select 1 from public.comped_access c
      where c.organization_id = o.id
        and c.revoked_at is null and c.expires_at > now()))  as active_comped,
    count(*)                                                 as total_orgs
  from public.organizations o;

  -- 3. Anyone whose ONLY entitlement was the expired org trial — these orgs are
  --    genuinely out of entitlement and are NOT affected by this bug. I need to
  --    tell the two groups apart before contacting anyone.
  select count(*) as trial_expired_no_other_entitlement
  from public.organizations o
  where not public.has_active_subscription(o.id);

  -- 4. Golden Room specifically, to confirm the fix landed.
  select o.name, o.grandfathered_lifetime, o.plan_type, o.plan_tier,
         public.has_active_subscription(o.id) as db_says_entitled,
         (select max(c.expires_at) from public.comped_access c
           where c.organization_id = o.id and c.revoked_at is null) as comp_until
  from public.organizations o
  where o.name ilike '%golden%';

Confirm the function is DEPLOYED, not just committed.
````

---

## Question 2, answered directly: why the two gates disagree

They are not the same predicate and were never written to be. `has_active_subscription`
takes an **org id**; `check-subscription` takes a **user** and picks one of their orgs.

| | `has_active_subscription(_org_id)` (DB) | `check-subscription` (edge) |
|---|---|---|
| **Grain** | one org, exactly | one user → **first** membership found |
| **Stripe source** | `stripe_subscriptions` table (local mirror) | Stripe API, live |
| **`past_due`** | **grants** access | **blocks** access |
| **Lifetime linkage** | `organizations.owner_id` | `org_memberships` (any role) |
| **Comped `revoked_at`** | required `IS NULL` | **not checked** |
| **Comped role** | n/a — org-level | owner/admin/manager only |

So there are four live divergences, and they point in both directions:

- **`past_due`** — the DB lets them in, the frontend throws them out. A customer
  with a failed payment can be blocked by the paywall while every RLS policy
  still considers them entitled.
- **`revoked_at`** — the reverse: a revoked comp still passes the frontend gate.
- **Stripe table vs Stripe API** — if the `stripe_subscriptions` mirror is stale,
  the DB and the frontend disagree about the same subscription.
- **owner_id vs membership** — a lifetime purchase recorded against an email that
  is a *member* but not the `owner_id` of the org counts for the edge function and
  not for the DB.

**Which is authoritative:** the database function is. RLS decides what actually
happens to a write; the edge function only decides what the UI shows. When they
disagree the user gets one of two bad outcomes — locked out of a working account
(this case), or let in to an account where every insert fails on RLS. The second
is explicitly called out in the comment at `:107-112` as something that already
happened once.

**Recommendation, not done here:** have `check-subscription` call
`has_active_subscription(org_id)` for the resolved org and return that, keeping
Stripe only for the *display* fields (period end, trial end, payment_failed).
One predicate, one place. That is a bigger change than this incident needs and
should not be bundled into the fix that unblocks Golden Room.

## Two wrong copy strings noticed in the same file, not changed

- `TRIAL_DURATION_DAYS = 60` (`:14`) — the offer is a 14-day trial.
- `"Your 30-day money-back guarantee has ended."` (`:360`) — there is no
  money-back guarantee; this was removed from 11 frontend files on 2026-07-30.

The second is a false statement shown to a customer at the moment they are being
asked to pay. Both are deliberately left out of the prompt above because changing
the trial length alters who has access, and that decision should not ride along
with an outage fix.
