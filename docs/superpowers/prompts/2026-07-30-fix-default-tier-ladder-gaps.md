# Lovable prompt — the built-in default tier ladder has holes the UI can't reach

**Status:** not yet run. Queue with the other Lovable work.
**Found:** 2026-07-30, following the `validateTierThresholds` cent-precision fix (`d4a9fa31`).
**Severity:** LOW impact, but affects the MAJORITY of orgs and cannot be fixed by any owner.

---

## The finding

Three functions carry a fallback for orgs with no `client_tier_settings` rows.
**Two of them describe the ladder as ranges; the third assigns tiers with a
cascading chain. The two encodings do not agree.**

`get_org_tiers` (`20260729231023…sql:122-128`) and `get_loyalty_tier_info`
(`20260729193530…sql:53-60`) both return:

```sql
SELECT 'Bronze',   1, 0,    499
SELECT 'Silver',   2, 500,  1999
SELECT 'Gold',     3, 2000, 4999
SELECT 'Platinum', 4, 5000, NULL
```

Bounds are inclusive and `lifetime_spend` is `numeric(12,2)`, so that description
leaves three uncovered bands: **499.01-499.99, 1999.01-1999.99, 4999.01-4999.99.**

But `resolve_customer_tier` (`20260729231023…sql:195-201`) does **not** use ranges:

```sql
IF    v_spend >= 5000 THEN RETURN 'Platinum';
ELSIF v_spend >= 2000 THEN RETURN 'Gold';
ELSIF v_spend >= 500  THEN RETURN 'Silver';
ELSIF v_spend >= 0    THEN RETURN 'Bronze';
END IF;
```

A cascading chain has **no holes at all**. Spend of $4,999.50 is not `>= 5000`, is
`>= 2000`, so it returns `'Gold'`.

So for an unconfigured org the server *assigns* Gold and *describes* a ladder in
which Gold stops at 4999. The client believes the description.

## Why no one can fix this from the app

The fallback fires only when the org has **zero** `client_tier_settings` rows.
There is no seed INSERT in any migration and no default in `src/` — verified. So
these numbers exist only inside the function bodies. An owner editing tiers in the
admin UI creates real rows, which *stops* the fallback firing entirely rather than
correcting it. There is no sequence of UI actions that repairs this.

## Why it got worse today, honestly

Commit `23b7b39d` made the client honor `max_spending` inclusively, to match
`resolve_customer_tier`. That was right for the ~29 **configured** orgs, where the
resolver genuinely returns NULL inside a gap.

It is wrong for **unconfigured** orgs, because their resolver path is the chain,
which has no gaps. Before that commit the client ignored `max_spending` and did
pure `>= min_spending` matching — which happens to be exactly what the chain does,
so the two agreed by accident. Now they disagree in those three bands.

**The client cannot fix this itself.** An org that *configures* `0-499 / 500-1999 /
2000-4999 / 5000-null` genuinely has holes; an org that configures nothing gets the
same four rows with no holes. Identical payload, opposite truth, and the provenance
is not in the response. This has to be fixed server-side.

---

## The prompt

```
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: three functions carry a default tier ladder for organisations with no
rows in client_tier_settings. They disagree with each other.

get_org_tiers and get_loyalty_tier_info describe the default ladder as inclusive
ranges: Bronze 0-499, Silver 500-1999, Gold 2000-4999, Platinum 5000-NULL.

resolve_customer_tier does NOT use those ranges. Its fallback is a cascading
chain: >= 5000 Platinum, >= 2000 Gold, >= 500 Silver, >= 0 Bronze.

lifetime_spend is numeric(12,2) and the range bounds are inclusive, so the two
encodings disagree for spend in 499.01-499.99, 1999.01-1999.99 and
4999.01-4999.99. resolve_customer_tier assigns a tier there; the ranges say no
tier covers it. The client UI reads the ranges and shows the customer as holding
no tier, while the server has in fact assigned them one.

FIX: make the described ranges match what resolve_customer_tier actually does.
The chain is correct and should NOT change. Change only the upper bounds in the
two fallback range lists, in BOTH functions, so they are contiguous to the cent:

  Bronze   0    -> 499.99
  Silver   500  -> 1999.99
  Gold     2000 -> 4999.99
  Platinum 5000 -> NULL      (unchanged)

That is: replace 499::NUMERIC with 499.99::NUMERIC, 1999::NUMERIC with
1999.99::NUMERIC, and 4999::NUMERIC with 4999.99::NUMERIC, in the ELSE branch of
BOTH public.get_org_tiers(uuid) AND public.get_loyalty_tier_info(uuid).

Do NOT touch the branch that reads real client_tier_settings rows, and do NOT
change resolve_customer_tier. Keep the existing authorisation checks, the REVOKE
/ GRANT lines, and get_loyalty_tier_info's service_role-only grant exactly as
they are.

This changes no stored data — both functions are read-only and the fallback rows
are computed, not persisted.

AFTERWARDS please paste:

  select pg_get_functiondef('public.get_org_tiers(uuid)'::regprocedure);
  select pg_get_functiondef('public.get_loyalty_tier_info(uuid)'::regprocedure);

  -- how many orgs actually hit the fallback
  select
    (select count(*) from public.organizations) as total_orgs,
    (select count(distinct organization_id) from public.client_tier_settings)
      as orgs_with_configured_tiers;

Confirm the migration RAN, not just that a file was created.
```

---

## Relationship to the other tier work

- `d4a9fa31` fixed the **client validator** so a human editing a ladder is warned
  about a sub-dollar hole. Prevents new holes in `client_tier_settings`.
- `2026-07-30-find-gapped-tier-ladders.md` finds holes **already saved** by the ~29
  configured orgs, and the customers standing in them.
- **This prompt** fixes the holes in the **built-in default**, which is the only one
  of the three that no owner can reach.

Run order does not matter; they touch different things. This one is the cheapest
and has no data implications.
