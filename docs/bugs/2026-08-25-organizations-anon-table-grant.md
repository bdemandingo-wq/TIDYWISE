# Finding: `anon` holds a full table grant on `public.organizations`

Logged 2026-08-25. **Not fixed** — deliberately left out of the onboarding-columns
grant change so it can be dealt with on its own.

## What

`anon` has `arwdDxtm` (all privileges) on `public.organizations`.

## Impact today

Currently harmless: every RLS policy on `organizations` is `TO authenticated`, so
no row is reachable by `anon` regardless of the grant. RLS is the thing holding
the line, not the grant.

## Why it still matters

The grant is a latent hazard. Anyone who later adds a policy `TO public` or
`FOR ALL USING (true)` — or forgets a `TO authenticated` clause — instantly hands
anonymous callers full read/write on the org table, including billing-state
columns. Defense in depth says the grant should not exist.

## Proposed fix (separate change)

```sql
REVOKE ALL ON public.organizations FROM anon;
```

Before applying, confirm no public/unauthenticated path reads `organizations`
directly through PostgREST (public booking pages, score pages, and the client
portal are the ones to check — several of them go through SECURITY DEFINER RPCs
rather than direct table reads, which would be unaffected).
