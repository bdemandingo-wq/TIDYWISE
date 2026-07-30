# Pricing and trial claims audit

**Audited:** 2026-07-30. **The offer:** 14-day trial, plans from $49/mo. No $50 tier.
**src/ fixes shipped.** Database items and one decision are below, unfixed.

---

## The split you asked for

| Known-wrong claim | Lives in |
|---|---|
| "60-day free trial" | **database** — not present anywhere in `src/` |
| "$50/month" | **database** (one `src/` instance found separately, fixed) |
| "Free forever for cleaning teams" | **database** — not present anywhere in `src/` |
| "30-day money-back guarantee" | **`src/`**, in 11 files — see the decision below |
| "$49/mo" | `src/`, correct, left alone |

Grep for `60-day`, `$50/month` and `free forever` across `src/` returns nothing
relevant, which confirms those three live only in `blog_posts` rows. The hardcoded
posts under `src/pages/blog/*.tsx` (13 of them) are routed individually in `App.tsx`;
`DynamicBlogPost.tsx` serves everything else from the `blog_posts` table, and
`prerender-routes.ts:58` pulls that same table for the indexed/pre-rendered copies.
That is why the "indexed version" of a post can say something the `src/` version does
not.

---

## Fixed in src/

| File | Was | Now |
|---|---|---|
| `PricingPage.tsx:954` | "Is there a money-back guarantee?" → **"No trial — you pay from day one"** | "How does the free trial work?" → describes the 14-day trial |
| `blog/CleaningBusinessCRM.tsx:147` | TidyWise trial: **30 days** | 14 days |
| `dashboard/SubscriptionBanner.tsx:6` | "inside the **60-day** org trial" | 14-day |
| `hooks/useSubscription.ts:75` | "Even during the **7-day** trial" | 14-day |
| `admin/PlatformAnalyticsPage.tsx:835` | "restart the TidyWise Pro (**$50/mo**) subscription" | price removed |

**The pricing page was contradicting itself.** Line 581 promises "Start with a 14-day
free trial — card required, cancel anytime", and 250 lines later the FAQ said **"No
trial — you pay from day one."** Both were on the same page, visible to the same
visitor. That FAQ answer also never answered the question it was asked. It predates the
trial existing.

On `$50/mo`: I removed the figure rather than substituting `$97`. The sentence
describes a Stripe checkout link whose actual price is not visible from that component,
so asserting a specific number would have been another guess. "restart the TidyWise Pro
subscription" is true regardless of what the link charges.

---

## Product vs marketing: the trial length

You asked what the app itself claims. **The paid trial is genuinely 14 days** and
matches your offer:

- `create-subscription/index.ts:227` — `const TRIAL_DAYS = 14`, passed to Stripe as
  `trial_period_days` at `:247` ✅

**But there is a second, different trial in the database:**

- `20260625042915…sql:2` — `ALTER TABLE profiles ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days')`
- `handle_new_user` sets the same **7 days** on signup

So a user who signs up but has not yet checked out is on a **7-day** clock in
`profiles.trial_ends_at`, while anyone who reaches Stripe gets **14**. Nothing in the
UI distinguishes them. Whether that is intentional (a shorter pre-checkout window) or
drift from before the trial became 14 days, I cannot tell from the code — but it is the
only place the product still says 7, and it is a migration, so it needs Lovable.

No trial length is stated in any email template — checked `send-welcome-email` and the
signup notification functions; none mention a duration.

---

## RESOLVED: the 30-day money-back guarantee did not exist — all 11 files cleared

**Answer to "is it in Stripe product descriptions, checkout, or terms?" — no, and the
terms say the exact opposite.**

`src/components/legal/termsContent.tsx:22-29`, `REFUND_POLICY`:

> "**All payments are final and non-refundable.** This includes subscription fees
> (monthly and yearly), one-time lifetime purchases, and AI credit top-ups. You may
> cancel your subscription at any time; cancellation stops future billing but no
> refunds, credits, or prorated amounts are issued for the current or past billing
> periods. **This policy is disclosed at signup directly beside the required consent
> checkbox**, in the Terms of Service, and on the public terms page…"

So there is no obligation to preserve. There was a **contradiction to remove**, and it
ran the opposite way from the risk you were guarding against:

1. That string is submitted to Stripe as **dispute evidence** (`refund_policy`) — the
   file header says so at `:5`, and `supabase/functions/_shared/policies.ts:12` holds a
   verbatim copy for edge functions.
2. It asserts the policy is **consistently disclosed** — which 11 marketing pages
   promising a refund directly falsified.
3. A customer who screenshotted "30-day money-back guarantee" from a comparison page
   and disputed a charge would have been contradicting our own dispute defence **with
   our own website**. That weakens every dispute response, not just theirs.

Removing the claim was therefore more urgent than leaving it, not less.

### Historical note — the decision as it stood before that check

**Was not changed, because it was not knowable whether it existed**, and guessing was
wrong in both directions — asserting a guarantee you do not offer is a trust and chargeback problem;
deleting a real one removes a competitive selling point from 11 pages.

The evidence points to it **not** existing:

- Your stated offer is "14-day trial, plans from $49/mo" — no guarantee mentioned
- `PricingPage`'s FAQ, before today's fix, described cancel-anytime and **no
  guarantee at all**
- You listed it under "known wrong"

But it is claimed in **11 files, 27 lines**:

```
src/pages/blog/BestSoftwareForCleaners.tsx        "$49/month after a 30-day money-back guarantee"
src/pages/blog/CleaningBusinessCRM.tsx            4 separate claims
src/pages/blog/BookingKoalaVsJobberVsTidywise.tsx "money-back within 30 days"
src/pages/compare/CompareJobber.tsx               comparison row + CTA
src/pages/compare/CompareZenMaid.tsx              comparison row + bullet
src/pages/compare/CompareBookingKoala.tsx         comparison row
src/pages/compare/CompareHousecallPro.tsx         comparison row
src/pages/compare/CompareLaunch27.tsx             comparison row + bullet
src/pages/compare/CompareServiceTitan.tsx         comparison row + bullet + table
src/pages/compare/CompareNichePage.tsx            "Plans from $49/mo · 30-day money-back guarantee"
src/pages/locations/LocationSoftwarePage.tsx      "14-day money-back guarantee on annual plans"
```

Note the last one says **14 days on annual plans** — so the codebase does not even agree
with itself on the guarantee's length.

**One line needs attention whichever way you decide**, because it now argues against
your own offer — `blog/CleaningBusinessCRM.tsx:480`:

> "A 14-day trial often isn't enough to truly evaluate software. TIDYWISE offers 30-day
> money-back guarantee—enough time to run your business through a full billing cycle"

That was written to contrast with competitors' 14-day trials. **You now offer a 14-day
trial**, so this page tells visitors your own trial is too short. It needs rewriting
regardless of the guarantee decision.

(`CleaningBusinessCRM.tsx:244` also ends `"...money-back guarantee ()."` — an empty
parenthesis, presumably a citation that never got filled in.)

### What was actually done

Option 1. Every TidyWise money-back claim removed across 11 files.

- **Comparison rows deleted outright**, not relabelled. Changing
  `{ feature: "Money-back guarantee", tidywise: "30 days", jobber: "14-day trial", winner: "tidywise" }`
  into a "Free trial" row would have made `winner: "tidywise"` **false** — four of the
  six competitors also offer 14 days, so we tie. Substituting a metric we do not win
  would have repeated the exact error being fixed.
- **Three stat tiles read "2 Months / Money-back"** on the Jobber, BookingKoala and
  HousecallPro pages — a *two-month* guarantee, wronger still than 30 days. Now
  "14 Days / Free trial".
- **The CRM post's comparison table header said "Money-back"** but the column rendered
  `comp.trial`. The header was simply mislabelled; it now says "Free trial" and matches
  its own data.
- **Five CTAs** ("Start your money-back within 30 days today") → "Start your 14-day
  free trial today".
- `CleaningBusinessCRM.tsx:244` also ended `"...money-back guarantee ()."` — an empty
  parenthesis where a citation never landed. Gone with the claim.

**Deliberately left alone:** `CompareZenMaid.tsx:157` lists a "30-day money-back
guarantee" among **ZenMaid's** attributes. That is a claim about a competitor, not
about us. Leaving a rival's genuine advantage in place is the same honesty principle —
but it was authored alongside our false claim, so it may be equally invented. Worth
verifying independently; I had no basis to change it either way.

---

## Database items — to queue for Lovable

I cannot see `blog_posts` rows from here. These queries find them:

```sql
-- Every published post asserting a wrong trial length or price
select slug, title, status, published_at,
       case when content ilike '%60-day%' or content ilike '%60 day%' then '60-day trial' end as c1,
       case when content ilike '%$50%'                                then '$50 price'    end as c2,
       case when content ilike '%free forever%'                       then 'free forever' end as c3,
       case when content ilike '%30-day money%' or content ilike '%30 day money%' then '30-day guarantee' end as c4
from public.blog_posts
where content ilike '%60-day%' or content ilike '%60 day%'
   or content ilike '%$50%'
   or content ilike '%free forever%'
   or content ilike '%30-day money%' or content ilike '%30 day money%'
order by status, published_at desc nulls last;

-- Meta descriptions specifically — the "free forever" one you saw is meta, not body
select slug, title, meta_title, meta_description, status
from public.blog_posts
where meta_description ilike '%free forever%'
   or meta_description ilike '%60%day%'
   or meta_description ilike '%$50%'
   or meta_title       ilike '%free forever%';

-- Anything claiming a trial length that is not 14
select slug, title, status,
       substring(content from '.{0,80}[0-9]+[- ]day[s]? (free )?trial.{0,80}') as context
from public.blog_posts
where content ~* '[0-9]+[- ]day[s]? (free )?trial'
  and content !~* '14[- ]day'
order by published_at desc nulls last;
```

**Two things to know before editing those rows:**

1. **Pre-rendered copies are separate.** `prerender-routes.ts` reads `blog_posts` at
   build time, so fixing a row does not fix the indexed HTML until the site is rebuilt
   and re-crawled. The "indexed version of the best-software post" you saw is that
   artefact. Budget for a rebuild plus re-crawl, not just an `UPDATE`.
2. **The generator will keep producing these.** `generate-daily-blogs`'s system prompt
   contains no pricing or trial facts at all, so the model invents them — which is
   exactly how "60-day free trial" and "$50/month" got written. Fixing the rows without
   fixing the prompt means it recurs. Worth folding a "FACTS YOU MUST NOT INVENT"
   block (14-day trial; $49/$97/$197; no $50 tier) into the queued
   `2026-07-30-blog-tidywise-positioning-score.md` prompt while that function is open
   anyway.
