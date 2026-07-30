# TidyWise SaaS (jointidywise)

Multi-tenant cleaning-business SaaS. React + TypeScript + Vite + Tailwind/shadcn on the front end, Supabase (Postgres + 200+ Deno edge functions) on the back, Capacitor wrapping the same `dist/` build into a native iOS app. Live at jointidywise.com; the iOS app is `com.jointidywise.app`.

This project was built in **Lovable**, and Lovable still writes to it. That fact drives most of the rules below.

---

## The ownership split — read this first

Two agents write to this repo:

- **Lovable** (`gpt-engineer-app[bot]`) — auto-commits straight to `origin/main`. It owns `supabase/` in practice: over the last 30 commits touching `supabase/migrations/`, 20 were Lovable's.
- **You / Claude Code** — owns `src/`, tests, config, docs.

**Lovable is the source of truth, not this local clone.** The working copy goes stale fast. Before reasoning about "what's live," `git fetch origin main` and read `origin/main`. To sync: stash, then `git merge --ff-only origin/main`.

### A git push never deploys anything backend

This is the single most expensive lesson in this repo. Pushing to GitHub changes *files*. It does not:

- deploy an edge function
- run a migration
- publish the web app
- rebuild the iOS app

The main Supabase project (`slwfkaqczvwvvvavkgpr`) is **Lovable Cloud** — fully managed inside Lovable. There is no separate Supabase dashboard login and no access token, so the Supabase CLI and any external Supabase MCP **cannot reach it**. (The Supabase MCP connected to this machine reaches only a different side project, `tidywise-webhooks` / `lrobbjozyzfbmezpeycl`. Calls against the main ref return "You do not have permission" — that's expected, not a broken session.)

| Change | How it actually ships |
|---|---|
| `src/**` | Lovable **publish** (or the normal web deploy) |
| `supabase/functions/**` | Ask Lovable in-chat to edit **and deploy** that function |
| `supabase/migrations/**` | Ask Lovable in-chat to run it; then verify against the live DB |
| iOS | `npm run build` → `npx cap sync ios` → Xcode archive → App Store Connect |

So the deliverable for backend work is **a paste-ready Lovable prompt**, not an edit to `supabase/`. End it with "deploy the X function" and "confirm deployed, not just committed."

Confirmed the hard way (2026-06-13): `create-subscription` had `trial_period_days: 7` committed, but live checkout still charged immediately — the deployed function was stale.

### Lovable edits things you didn't ask for

Confirmed 2026-07-14: while publishing an unrelated frontend commit, Lovable replaced the `org_memberships` INSERT policy on its own, because it judged something was "blocking publish." That table carries the owner-protection / anti-privilege-escalation hardening.

**After any Lovable publish**, diff before trusting anything:

```sh
git log <last-known-good>..origin/main -- supabase/migrations/
```

Pay particular attention to `org_memberships` and auth tables.

### The ownership split is a convention, not a boundary — Lovable writes to `src/` and `tests/` too

The table above describes who *owns* what. It does not constrain what Lovable actually edits. Nothing enforces the split.

Confirmed 2026-07-29, three times in a single session, Lovable modified files on the Claude Code side of the line:

- `src/pages/portal/PortalDashboardPage.tsx` — deleted a component
- `tests/security.spec.ts` — deleted two test cases

Both edits were *correct in intent* (they removed a feature that was being retired). The problem is not that Lovable was wrong; it is that **the local tree silently stopped matching `origin/main` while work was in progress on an unpushed branch.** Two agents edited the same region from different base states.

**So: `git fetch origin main` before assuming your working tree matches — not just before reasoning about `supabase/`.** Treat `src/` and `tests/` as shared, not owned.

```sh
git fetch origin main
git log --oneline HEAD...origin/main --left-right   # < yours, > theirs
git diff --stat HEAD origin/main                    # what actually moved
```

Practical habits that follow from this:

- **Fetch at the start of a task, not only at the end.** A stale base turns a clean edit into a conflict.
- **Do the work on a branch and merge `origin/main` deliberately.** Do not develop directly on a local `main` that Lovable is also advancing.
- **When resolving a conflict, check what Lovable's side was trying to achieve** before taking `--ours`. Its edit is usually right about *intent* and thinner on *cause* — in the case above it deleted a button but left the inline-component pattern that made the bug repeatable, and left two now-unused imports behind.
- **Re-run `npx tsc --noEmit -p tsconfig.app.json` and lint the touched files after any merge.** Lovable's deletions have left dead imports more than once.

---

## Commands

```sh
npm run dev            # vite dev server
npm run build          # production build -> dist/
npm run lint           # eslint
npm run test:e2e       # playwright, e2e/
npm run test:qa        # playwright, tests/ (multi-org regression suite)
npm run test:qa:report # open the last QA report
```

### Typecheck

```sh
npx tsc --noEmit -p tsconfig.app.json
```

**The `-p tsconfig.app.json` is not optional.** Root `tsconfig.json` is a solution-style file: `"files": []` plus project references. A bare `npx tsc --noEmit` therefore compiles **zero files** and exits clean no matter how broken the code is. Measured in this repo: bare invocation lists 0 files; with `-p tsconfig.app.json` it checks 518.

There is deliberately **no `typecheck` script** in `package.json`. Don't add one that omits the flag, and don't trust a green bare `tsc` as evidence of anything.

Note the config is lenient — `strict: false`, `noUnusedLocals: false` — but `noImplicitAny: true`. `src/lib/generate-sitemap.ts` and `src/lib/prerender-routes.ts` are excluded from the app project.

---

## Layout

```
src/
  components/    ~289 files — feature dirs + ui/ (shadcn primitives)
  pages/         ~116 files — route components, lazy-loaded in App.tsx
  hooks/         ~53 files  — react-query data hooks (useX pattern)
  lib/           ~45 files  — supabase client, sentry, utils
  contexts/      Organization, ClientPortal, TestMode
  features/      staff-auth
  integrations/  supabase/{client,types}.ts (generated types), lovable/
supabase/
  functions/     203 dirs (202 functions + _shared)
  migrations/    483 .sql files
  config.toml    per-function verify_jwt
e2e/, tests/     Playwright — see tests/README.md
ios/             Capacitor native project
```

### One Supabase client, always

Import from `@/lib/supabase` (or `@/integrations/supabase/client`, which just re-exports it). **Never call `createClient` again.**

`src/integrations/supabase/client.ts` carries the warning in-file: when it had its own `createClient`, the generated client used `localStorage` while the unified client used Capacitor Preferences. On native iOS the generated client had *no auth session*, so every RLS-protected query silently returned empty rows — the onboarding card and notification bell just showed nothing. Found 2026-07-20.

Storage is platform-dependent by design: Capacitor Preferences on native, `localStorage` on web, via `getStorageAdapter()`. `detectSessionInUrl` is false on native (deep links are handled manually).

The anon key is public on purpose — security is RLS. That is not a licence to relax RLS.

---

## Rules that cost real hours

### 1. Never put a `Set` or `Map` inside a persisted react-query result

The query cache is persisted to `localStorage` (`PersistQueryClientProvider`, key `tw-offline-cache`) so the app opens offline with yesterday's data. Persistence is `JSON.stringify`/`parse`, and **that flattens a `Map`/`Set` to `{}`**. It rehydrates as a plain object and throws `TypeError: [x].get is not a function` on the next `.get()`/`.has()`.

`App.tsx` defends with `containsMapOrSet()` in `shouldDehydrateQuery`, plus a `buster: 'v2-no-maps'` to discard poisoned caches. That guard is **deliberately shallow** — the value itself and one level of top-level properties. A `Map` nested deeper will slip through.

The right fix is to not put one there: return a plain object or an array of pairs and build the `Map` in a selector or at the point of use. Known casualties: `service-pricing` (`useServicePricing.ts`, confirmed live 2026-07-14), `customer-stats-for-dedupe`, and the Staff Portal.

`service-pricing` is excluded from persistence for a second reason too — a stale cached price could mis-charge a customer. Pricing should never come from an offline cache.

### 2. Never grant `EXECUTE` on a `SECURITY DEFINER` function to `authenticated` unless it authorizes the caller internally

`SECURITY DEFINER` runs with the definer's privileges and **bypasses RLS**. Granting it to `authenticated` hands every logged-in user of every org whatever that function can reach. In a multi-tenant app that is a cross-org data leak.

The function body must check the caller itself — `auth.uid()`, org membership, role — before touching anything. There are ~139 migrations mentioning `SECURITY DEFINER` and ~78 `GRANT EXECUTE ... TO authenticated`; the 128 `REVOKE` statements exist because this has gone wrong before.

Same shape applies to edge functions. **102 functions are `verify_jwt = false`** in `config.toml` — publicly callable with no JWT check at the gateway — so each one must authorize internally. A further **101 function dirs have no `config.toml` entry at all** and fall back to the default `verify_jwt = true`; if you add a function that needs to be public you must add the entry, and if you add one that doesn't, leave it out. (`recurring-booking-lapse-alert` is a stale config entry with no directory.)

### 3. `.range()` without `.order()` can skip or repeat rows

Postgres does not guarantee row order without `ORDER BY`. Paging with `.range()` on an unordered query means rows shift between pages: some are never returned, some come back twice.

**There is a live instance of this.** `supabase/functions/run-inactive-campaign/index.ts:158-165` loops `.range(page * pageSize, ...)` over `customers` with **no `.order()` at all** — an SMS marketing campaign that can silently skip customers or text them twice.

Ordering by a timestamp alone is not enough either: `platform-session-stats` orders by `session_start`, which is non-unique, so ties can still shuffle across page boundaries. **Always order by a unique tiebreaker** — add `.order('id')` alongside whatever you're sorting by.

### 4. A migration file existing is not proof it ran

Confirmed 2026-07-15 in a full drift audit. `20260501000000_split_stripe_secrets.sql` claims to move Stripe secrets into `org_stripe_secrets`. That table does not exist live. Neither does its audit table, nor one of its two helper RPCs. The surviving RPC `get_org_stripe_secret` references the nonexistent table and would error if called. The actual protection came from a *different*, earlier migration that did land.

`git log supabase/migrations/` is not evidence of live state. For anything security-relevant, verify empirically.

**Verification technique** (no service-role key needed): query a column via PostgREST with an explicit `select=`.

- Column genuinely missing → `400` / `42703 column X does not exist`
- Column exists but access revoked → `403` / `42501 permission denied for table X`

Those two codes are the tell. Run a deliberately-fake column name as a control to confirm which you're looking at.

### 4b. And live state existing is not proof a migration describes it

The mirror image of rule 4, and the more dangerous half — because rule 4 makes you *doubt* the migrations, while this one lets you trust them and be confidently wrong.

Confirmed 2026-07-29. `campaign_sms_sends` had a unique constraint `campaign_sms_sends_campaign_id_customer_id_key` on `(campaign_id, customer_id)`. It appears in **no migration file**. Grepping `supabase/migrations/` for constraints on that table returns four plain `CREATE INDEX` statements and nothing else.

What it cost: a campaign sent two SMS to the same customer. The first logged fine; the second failed with `23505` *after the SMS had already been delivered*, leaving no dedupe row, so that customer could be messaged again by the same campaign. Diagnosing it from the migrations produced the flatly wrong conclusion **"there are no unique constraints on this table, so the insert cannot fail on schema grounds"** — which sent the investigation looking at the queue worker's retry path instead of at the database. The real cause was a constraint that had been live the whole time.

**How to apply:** when a write fails and the code looks correct, check the live schema before theorising about the code. `git grep` over `supabase/migrations/` is a *hypothesis*, never an answer. Lovable and the Supabase dashboard can both alter schema without producing a migration file, so drift runs in both directions and neither artefact is authoritative on its own.

Ask the live database directly:

```sql
-- every constraint on a table, including ones no migration mentions
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.<table>'::regclass
order by contype, conname;

-- and every index, unique or not
select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = '<table>';
```

`contype`: `u` unique, `p` primary key, `f` foreign key, `c` check.

Postgres error codes worth recognising on sight, since they name the cause faster than any amount of code reading: `23505` unique violation, `23503` foreign key violation, `23502` not-null violation, `23514` check violation, `42703` undefined column, `42501` insufficient privilege.

### 5. Don't swallow errors into empty state

A silent wrong answer costs hours; a loud failure costs minutes. `catch { return [] }` and `if (error) return []` turn "the query broke" into "there is no data," which renders as a legitimately-empty dashboard. The iOS session bug in the client section above presented exactly this way — empty cards, no error, no clue.

There are ~12 catch-to-empty and ~8 `if (error)`-to-empty sites in `src/` already. Don't add more. Let the error reach react-query's `error` state, surface it, and report it to Sentry (`src/lib/sentry.ts`). If a fallback is genuinely correct, comment *why* — and make sure the UI can tell "empty" from "failed."

---

## Conventions

- Path alias `@/*` → `src/*`.
- Data access goes through a `use*` hook in `src/hooks/`, not inline `supabase` calls in components.
- Routes are lazy-loaded in `App.tsx` and wrapped in role guards: `AdminRoute`, `StaffRoute`, `FinancialRoute`, `ProtectedPortalRoute`, `PlatformAdminRoute`. New routes need the right guard.
- `src/integrations/supabase/types.ts` is generated. Don't hand-edit; regenerate from the schema.
- Multi-tenancy: almost everything is scoped by `organization_id`. Any new query or policy needs it. `tests/cross-org-isolation.spec.ts` exists to catch leaks.
- Default query settings: `staleTime` 5 min, `gcTime` 24 h (must cover the offline window), `refetchOnWindowFocus: false`, `retry: 1`.
- Money: display must mirror whatever system actually charges — Stripe is the source of truth, even when the honest number is lower than you'd like.

---

## Before calling a change done

1. `npx tsc --noEmit -p tsconfig.app.json` (with the flag)
2. `npm run lint`
3. Relevant Playwright spec, if the area is covered
4. If it touched `supabase/` — hand over a Lovable prompt and confirm **deployed**, not committed
5. If it touched schema — verify against the live DB, don't trust the file
