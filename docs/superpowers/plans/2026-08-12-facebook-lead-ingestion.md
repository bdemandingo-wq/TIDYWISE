# Facebook Lead Ingestion Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meta Lead Ads webhooks actually create `leads` rows, multi-tenant from the first line, with no hardcoded `organization_id`.

**Architecture:** Extract every decision the webhook makes into one dependency-free module (`_shared/facebook-lead-mapping.ts`) so the logic is unit-testable without Deno, Supabase, or network access. Replace the nonexistent `business_settings.facebook_page_id` lookup with a dedicated `facebook_page_connections` table keyed on `page_id`, which doubles as the write target for a future in-app "Connect Facebook" flow. `index.ts` becomes thin plumbing around the pure module.

**Tech Stack:** Deno edge functions, Postgres/Supabase, Playwright as the test runner (the repo's only runner — there is no vitest/jest).

**Status:** Plan approved 2026-08-12. Task 6 (idempotency) is **IN**. BLOCKER B1 ships in the **same Lovable session as Task 1**. Task 7 requires a usage check before deletion. Backfill task dropped — see "Verified during planning".

### Progress log

| Date | Done | Evidence |
|---|---|---|
| 2026-08-12 | Both spec files written; `unit` project added to `playwright.qa.config.ts` | contract spec RED: 10 failed / 15 passed |
| 2026-08-12 | `_shared/facebook-lead-mapping.ts` complete — Tasks 2, 3 and 6's pure logic | unit spec **28/28 pass**, eslint clean, 0 imports, 0 `Deno.` refs |

**Remaining, in order:** Task 1 (+B1) migration via Lovable → Task 4 rewire `index.ts` → Task 6 migration + claim wiring → Task 5 contract re-run + `security.spec.ts` → Task 7 usage check → Task 8 go-live.

### Note for whoever runs the RED steps: ES modules need stubs

`tests/facebook-lead-mapping.unit.spec.ts` uses static named imports, so a symbol that does not exist yet is a **link-time `SyntaxError`**, not a test failure — Playwright reports "No tests found" and collects zero tests. That is a real RED (nothing is implemented) but a coarse one: it cannot distinguish 28 correctly-wired tests from a typo in the spec.

The fix used here, worth repeating for the next module: write the first group of functions for real, and add the not-yet-implemented exports as stubs that `throw new Error("... not implemented")`. The spec then links, and the pending tests fail on their own assertions. Measured sequence:

| Stage | Result |
|---|---|
| No module at all | `SyntaxError` / no tests collected |
| Mapping + row assembly real, resolver + classifier stubbed | 18 passed, 10 failed on `not implemented` |
| Resolver implemented | 24 passed, 4 failed |
| Classifier implemented | **28 passed** |

## Global Constraints

- `leads` columns are exactly: `name` **NOT NULL**, `email` **NOT NULL**, `phone`, `address`, `city`, `state`, `zip_code`, `service_interest`, `message`, `source` (default `'website'`), `status` (CHECK in `new|contacted|qualified|converted|lost`), `assigned_to`, `organization_id`, `tags`, `estimated_value`, `notes`, timestamps. Source: `supabase/migrations/20251222044239_38d2d924-3641-4941-beb5-362f0b1dbc16.sql:80-96`, cross-checked against `src/integrations/supabase/types.ts:5626-5690`.
- `source` is written as lowercase `'facebook'`. `src/pages/admin/LeadsPage.tsx:327` uses `lead.source === sourceFilter` against `SOURCE_OPTIONS` value `'facebook'` (`:88-95`), so a capital F makes the lead invisible to the Facebook filter.
- No hardcoded `organization_id` anywhere in the new code.
- `supabase/**` ships **only** via a Lovable in-chat prompt that says *deploy*. A git push deploys nothing (CLAUDE.md, "A git push never deploys anything backend"). `tests/**` and config are Claude Code's and push normally.
- CLAUDE.md rule 2: any new `SECURITY DEFINER` function must authorize the caller internally. This plan adds none.
- CLAUDE.md rule 5: no `catch { return [] }` and no error-to-empty-state. Failures log loudly and stay visible.
- Verify against the live DB, never against migration files alone (rules 4 and 4b).

---

## Verified during planning (no assumptions)

| Claim | How verified | Result |
|---|---|---|
| Clean Collective's `organization_id` | `public-booking-data` edge function (anon-callable, read-only) with slug `clean-collective` | **`0ddb3567-4641-48c8-8ff7-4bf1b87681da`** |
| `business_settings.facebook_page_id` missing | PostgREST `select=` probe + fake-column control | `400`/`42703` — absent |
| `leads.first_name` / `last_name` missing | Same probe | `400`/`42703` — absent |
| `leads.email` is **NOT NULL** | `CREATE TABLE` at `20251222044239_*.sql:83` + generated types (`Row: email: string`, `Insert: email: string`) | Confirmed |
| Webhook deployed, signature gate live | `GET` on the function → `403 Forbidden` from its own code | Confirmed |
| `source` already lowercase in this function | `facebook-lead-webhook/index.ts:149` | Already `'facebook'` — no change needed here |
| `facebook_lead_webhook_events` row count | Queried 2026-08-12 | **0 rows, no `max(created_at)`** — Meta was never delivering, nothing was dropped, **no backfill needed** |

### Correction to the original brief, in our favour

The lowercase-`source` problem is **not** in `facebook-lead-webhook`. Line 149 already writes `'facebook'`. The capital-F defect lives in the *other* function, `facebook-lead/index.ts:48` (`body.source || "Facebook"`), which nothing in the repo calls. This plan locks the lowercase value behind a test so it cannot regress (Task 2), and Task 7 disposes of the orphan.

---

## Defects in scope

### Bug #1 — org lookup reads a column that does not exist, and discards the error

`index.ts:112-116` queries `business_settings.facebook_page_id`. The column is absent, so the query returns `42703`; but only `data` is destructured, so the error is thrown away and `orgMatch` is simply `null`. Execution then hits the fallback at `:121-122` and, failing that, `continue`s at `:126`. The insert is never reached.

The root cause is the discarded error, not the wrong column name. Task 3 makes the discard structurally impossible by passing the error into a pure resolver as an explicit argument.

### Bug #2 — insert writes columns `leads` does not have

`index.ts:144-153` inserts `first_name` / `last_name`. `leads` has a single `name TEXT NOT NULL`. Confirmed absent live. `first_name` on `leads` appears in **zero** migrations, so this shape was never correct — it is not drift.

### Bug #3 — `leads.email` is NOT NULL and the code inserts null (found while planning)

`index.ts:147` inserts `email: email ? email.toLowerCase() : null`. Facebook Lead Ads forms commonly collect phone only. The first such lead dies with `23502 not-null violation`, caught and logged at `:155`. Fixing #1 and #2 alone would leave this live.

Fix: synthesize `fb-lead-<leadgen_id>@facebook.invalid`. `.invalid` is reserved by RFC 2606, so it can never resolve to a real inbox or bounce against a real domain, and it makes the row's provenance obvious to whoever works the lead.

### Bug #4 — the single-org fallback is a cross-tenant hazard

`index.ts:121-122`: when the page lookup fails, it does `organizations.select('id').limit(2)` and adopts that org `if (allOrgs.length === 1)`. Any stranger's page could dump leads into whichever org happens to be alone in the table. Task 4 deletes it. The new resolver receives no org list at all, so the failure mode becomes unrepresentable.

### Bug #5 — no idempotency (Task 6, confirmed IN)

Meta retries any non-200 delivery. The existing dedupe is email-only and `continue`s when email is absent, so retried phone-only leads — the common case — duplicate freely. A duplicate lead means calling the same person twice. Task 6 adds a `leadgen_id` ledger.

---

## 🚧 BLOCKER B1 — ships in the same Lovable session as Task 1

`supabase/functions/morning-brief/index.ts:311-314` reads `facebook_lead_webhook_events` with **no `organization_id` filter**, on the service-role client, so RLS does not apply. That table has no `organization_id` column at all — `CREATE TABLE` is `(id, created_at, payload)` only (`20260225050938_*.sql:2-6`).

It is harmless today only because the table is empty (verified: 0 rows). **The moment Clean Collective's first real webhook lands, every other org's morning brief will list Clean Collective's lead names.** Customers' leads mailed to each other.

**Decision: B1 goes in the same Lovable session as Task 1.** It is two lines and it gates go-live.

```sql
alter table public.facebook_lead_webhook_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
create index if not exists facebook_lead_webhook_events_org_idx
  on public.facebook_lead_webhook_events (organization_id, created_at desc);
```

```ts
// morning-brief/index.ts:312 — add the filter
.from("facebook_lead_webhook_events")
.select("id, created_at, payload")
.eq("organization_id", orgId)          // <- the leak
.gte("created_at", twentyFourAgo);
```

Task 4 Step 2 stamps `organization_id` onto the raw event row so this filter has something to match. **Task 8 (go-live) must not start until B1 is verified applied.**

---

## File structure

| File | Responsibility |
|---|---|
| **Create** `supabase/functions/_shared/facebook-lead-mapping.ts` | Every decision, zero imports. Meta `field_data` → lead fields; lead row assembly; org resolution; claim classification. Precedent for a pure import-free `_shared` module: `format-address.ts` (0 imports, no `Deno.` globals). |
| **Create** `supabase/migrations/<ts>_facebook_page_connections.sql` | `page_id → organization_id` map, RLS-locked, seeded by *looking up* Clean Collective. Same session: B1's two lines. |
| **Create** `supabase/migrations/<ts>_facebook_lead_ingestions.sql` | Idempotency ledger (Task 6). |
| **Modify** `supabase/functions/facebook-lead-webhook/index.ts:100-158` | Thin plumbing: verify → store raw → resolve org → claim → fetch Graph → insert. No business logic. |
| **Create** `tests/facebook-lead-mapping.unit.spec.ts` | 28 pure unit tests. No network, browser, or login. ✅ written |
| **Create** `tests/facebook-lead-webhook.contract.spec.ts` | 25 live schema-drift contract + signature-gate tests, anon key only. ✅ written, RED verified (10 failed / 15 passed) |
| **Modify** `playwright.qa.config.ts` | Adds a `unit` project so pure tests skip the live-login dependency chain. ✅ done |
| **Modify** `tests/security.spec.ts:16-30` | Add `facebook-lead-webhook` to `KNOWN_PUBLIC` (signature-gated by design). |

### Design decision: `facebook_page_connections`, not a column on `business_settings`

```sql
create table public.facebook_page_connections (
  page_id           text primary key,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  page_name         text,
  page_access_token text,
  is_active         boolean not null default true,
  connected_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

Why this shape:

- **`page_id` as PRIMARY KEY** is the security property that matters: a Facebook page belongs to exactly one organization. Two orgs cannot claim the same page, so leads cannot be misrouted by a buggy or malicious connect flow. A nullable `business_settings.facebook_page_id` column gives no such guarantee.
- **One org : many pages** falls out for free. A company with a second regional page inserts another row.
- **`page_access_token` per row clears a multi-tenancy blocker that would surface at TidyWise Cleaning.** `index.ts:79` reads a single global `FACEBOOK_PAGE_ACCESS_TOKEN` env var, but each Facebook Page issues its *own* Page access token. One env var can serve exactly one page. It works today only because Clean Collective is the only connected page. The column is nullable and the code falls back to the env var, so nothing breaks now and page #2 brings its own token.
- **The future "Connect Facebook" flow inserts a row and is done** — no schema change, which was the stated requirement. Extension point: `insert into facebook_page_connections (page_id, organization_id, page_name, page_access_token, connected_by)`.
- **Rejected:** a column on `business_settings` (no uniqueness, one page per org, and it places a secret in a table the client already reads). **Rejected:** a JSON env-var map (invisible to the app, no FK, needs a redeploy per customer, cannot be written by a UI).

Token handling: RLS on, and **all grants revoked from `anon` and `authenticated`** — service role only. The future connect UI must write through an edge function, never PostgREST. Encryption at rest is a follow-up; note that `org_stripe_secrets` is **not** available as a pattern to copy — a prior audit found that migration never landed.

---

## Task 1: The `page_id → organization_id` map (+ BLOCKER B1)

**Files:**
- Create: `supabase/migrations/<timestamp>_facebook_page_connections.sql`
- Modify (B1, same session): `supabase/functions/morning-brief/index.ts:312`

**Interfaces — Produces:** table `public.facebook_page_connections(page_id text pk, organization_id uuid, page_name text, page_access_token text, is_active boolean, connected_by uuid, created_at, updated_at)`; one seeded row for page `1143280425539142`; column `facebook_lead_webhook_events.organization_id`.

**Note on the `leads` constraint inventory.** Per CLAUDE.md rule 4b, `git grep` over migrations is a hypothesis, never an answer — `campaign_sms_sends` carried a live unique constraint that appears in no migration file. But this does **not** gate the module or the migration: the placeholder emails are unique per `leadgen_id`, so a unique `(organization_id, email)` constraint holds either way. So the query is **folded into the single Task 1 Lovable message** below rather than spent as its own round trip. Read the answer before Task 4; revise only if a constraint turns up that the plan doesn't account for.

- [ ] **Step 1: Write the migration**

```sql
-- Facebook Page -> organization mapping.
-- Replaces the never-existent business_settings.facebook_page_id lookup in
-- facebook-lead-webhook. page_id is the PK: a Page belongs to exactly one org,
-- which is what stops leads being routed to the wrong tenant.
-- Written to be the insert target for a future in-app "Connect Facebook" flow
-- with no further schema change.

create table if not exists public.facebook_page_connections (
  page_id           text primary key,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  page_name         text,
  -- Each Page issues its own Page access token. NULL means "fall back to the
  -- FACEBOOK_PAGE_ACCESS_TOKEN env var", which is correct only while a single
  -- page is connected. Page #2 must supply its own.
  page_access_token text,
  is_active         boolean not null default true,
  connected_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists facebook_page_connections_org_idx
  on public.facebook_page_connections (organization_id);

alter table public.facebook_page_connections enable row level security;

-- No policies for anon/authenticated on purpose: page_access_token is a secret.
-- Service role bypasses RLS; the future connect UI must go through an edge
-- function, never PostgREST. (CLAUDE.md rule 2.)
revoke all on public.facebook_page_connections from anon, authenticated;

-- Seed by LOOKING UP the org, never by pasting a UUID.
insert into public.facebook_page_connections (page_id, organization_id, page_name)
select '1143280425539142', o.id, 'Clean Collective'
from public.organizations o
where o.slug = 'clean-collective'
on conflict (page_id) do nothing;

-- Fail loudly rather than leaving a silently unseeded table.
do $$
begin
  if not exists (
    select 1 from public.facebook_page_connections
    where page_id = '1143280425539142'
  ) then
    raise exception
      'Seed failed: no organizations row with slug=clean-collective; '
      'find the correct slug before re-running.';
  end if;
end $$;

-- BLOCKER B1 (same session): morning-brief reads this table with no tenant
-- filter on the service-role client. Give it a column to filter on.
alter table public.facebook_lead_webhook_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
create index if not exists facebook_lead_webhook_events_org_idx
  on public.facebook_lead_webhook_events (organization_id, created_at desc);
```

- [ ] **Step 2: Hand to Lovable and confirm applied — ONE message, one round trip**

Everything Lovable needs is in this single prompt: the migration, the seed result, the B1 function edit, and the constraint inventory. Do not split it.

> Apply a new migration creating `public.facebook_page_connections`: `page_id text primary key`, `organization_id uuid not null references organizations(id) on delete cascade`, `page_name text`, `page_access_token text`, `is_active boolean not null default true`, `connected_by uuid references auth.users(id)`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Add an index on `(organization_id)`. Enable RLS, add **no** policies for anon or authenticated, and `revoke all on public.facebook_page_connections from anon, authenticated`. Seed exactly one row: `page_id='1143280425539142'`, `organization_id = (select id from organizations where slug='clean-collective')`, `page_name='Clean Collective'`, with `on conflict (page_id) do nothing`, then `raise exception` if that row does not exist afterwards.
>
> In the same migration: `alter table public.facebook_lead_webhook_events add column if not exists organization_id uuid references organizations(id) on delete cascade`, plus an index on `(organization_id, created_at desc)`.
>
> Then edit and **deploy** the `morning-brief` edge function: its `facebook_lead_webhook_events` query (around line 312) must add `.eq("organization_id", orgId)`. Without that filter every org's morning brief lists every other org's Facebook leads.
>
> Confirm the migration **ran against the live database** and that morning-brief is **deployed, not just committed**. In the same reply, include the output of all three of these:
>
> ```sql
> -- 1. proof the seed resolved
> select page_id, organization_id, page_name from public.facebook_page_connections;
>
> -- 2. every constraint on leads, including any that no migration file mentions
> select conname, contype, pg_get_constraintdef(oid) as definition
> from pg_constraint
> where conrelid = 'public.leads'::regclass
> order by contype, conname;
>
> -- 3. every index on leads, unique or not
> select indexname, indexdef from pg_indexes
> where schemaname = 'public' and tablename = 'leads';
> ```

- [ ] **Step 3: Verify the seed resolved to the independently-confirmed org**

Expected: `1143280425539142 | 0ddb3567-4641-48c8-8ff7-4bf1b87681da | Clean Collective`.

If the UUID differs, **stop** — the slug resolved to a different org than the public booking endpoint returned, and the mapping is wrong.

- [ ] **Step 4: Verify B1's filter is actually deployed**

Ask Lovable to paste back the deployed `morning-brief` source around the `facebook_lead_webhook_events` query and confirm `.eq("organization_id", orgId)` is present. A committed-but-stale deploy is the documented failure mode in this repo.

- [ ] **Step 5: Confirm the contract test's Task-1 assertions go green**

```bash
npx playwright test -c playwright.qa.config.ts \
  tests/facebook-lead-webhook.contract.spec.ts --project=chromium --no-deps
```

Expected: the five `facebook_page_connections` tests and the `facebook_lead_webhook_events.organization_id` test flip from fail to pass. The three `facebook_lead_ingestions` tests still fail until Task 6. This is the empirical proof the migration ran — a green run here, not a committed file.

---

## Task 2: Pure mapping module — field and row logic (bugs #2, #3)

**Files:**
- Create: `supabase/functions/_shared/facebook-lead-mapping.ts`
- Test: `tests/facebook-lead-mapping.unit.spec.ts` (already written)
- Modify: `playwright.qa.config.ts` (already done)

**Interfaces — Produces:** `mapMetaFieldData`, `buildLeadRow`, `placeholderEmailFor`, `LEAD_SOURCE_FACEBOOK`; types `MetaFieldDatum`, `MappedLeadFields`, `LeadInsertRow`.

- [x] **Step 1: Confirm the tests fail for the right reason**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit
```

Expected: every test fails with `Cannot find module '../supabase/functions/_shared/facebook-lead-mapping'`. If they fail for any other reason, fix that first — a test that errors instead of failing proves nothing.

- [x] **Step 2: Write the minimal module**

```ts
// supabase/functions/_shared/facebook-lead-mapping.ts
/**
 * Pure mapping logic for Meta Lead Ads -> public.leads.
 *
 * Deliberately ZERO imports and no Deno globals so it is unit-testable from
 * the Playwright runner (same shape as _shared/format-address.ts).
 *
 * Column facts this encodes, verified against
 * 20251222044239_*.sql:80-96 and re-probed against the live schema:
 *   - leads.name  TEXT NOT NULL   (there is no first_name/last_name)
 *   - leads.email TEXT NOT NULL   (phone-only FB leads need a placeholder)
 *   - leads.status CHECK IN ('new','contacted','qualified','converted','lost')
 */

export const LEAD_SOURCE_FACEBOOK = "facebook";

const MAX_NAME = 200;
const MAX_EMAIL = 255;
const MAX_PHONE = 20;

export interface MetaFieldDatum {
  name?: string;
  values?: string[];
}

export interface MappedLeadFields {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface LeadInsertRow {
  name: string;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  notes: string;
  organization_id: string;
}

export function placeholderEmailFor(leadgenId: string): string {
  // .invalid is reserved by RFC 2606 — can never resolve to a real inbox.
  return `fb-lead-${leadgenId}@facebook.invalid`;
}

export function mapMetaFieldData(
  fieldData: MetaFieldDatum[] | null | undefined,
): MappedLeadFields {
  const f: Record<string, string> = {};
  for (const item of fieldData ?? []) {
    const key = item?.name?.toLowerCase();
    const value = item?.values?.[0];
    if (key && value) f[key] = value;
  }

  const first = f["first_name"];
  const last = f["last_name"];
  const full = f["full_name"];

  let name = [first, last].filter(Boolean).join(" ").trim();
  if (!name) name = (full ?? "").trim();
  if (!name) name = "Facebook Lead";

  const email = f["email"] ? f["email"].toLowerCase() : null;
  const phone = f["phone_number"] ?? f["phone"] ?? null;

  return { name, email, phone };
}

export function buildLeadRow(args: {
  fields: MappedLeadFields;
  leadgenId: string;
  organizationId: string;
}): LeadInsertRow {
  const { fields, leadgenId, organizationId } = args;
  return {
    name: fields.name.slice(0, MAX_NAME),
    // NOT NULL column: never pass through a null.
    email: (fields.email ?? placeholderEmailFor(leadgenId)).slice(0, MAX_EMAIL),
    phone: fields.phone ? fields.phone.slice(0, MAX_PHONE) : null,
    source: LEAD_SOURCE_FACEBOOK,
    status: "new",
    notes: `Auto-captured from Facebook Lead Ad (leadgen_id: ${leadgenId})`,
    organization_id: organizationId,
  };
}
```

- [x] **Step 3: Run and watch the mapping tests pass**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit
```

Expected: the `mapMetaFieldData` and `buildLeadRow` groups pass (18 tests). `resolveOrgFromConnection` and `classifyIngestionClaim` still fail — Task 3 and Task 6 add those. Output must be otherwise clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/facebook-lead-mapping.ts \
        tests/facebook-lead-mapping.unit.spec.ts playwright.qa.config.ts
git commit -m "test: pure Meta lead-field mapping with leads-schema regression guards"
```

---

## Task 3: Org resolution that cannot silently fail (bugs #1, #4)

**Files:**
- Modify: `supabase/functions/_shared/facebook-lead-mapping.ts`
- Test: `tests/facebook-lead-mapping.unit.spec.ts` (already written)

**Interfaces — Consumes:** Task 2's module. **Produces:** `resolveOrgFromConnection(args) => OrgResolution`; types `PageConnectionRow`, `OrgResolution`.

- [x] **Step 1: Confirm the resolver tests fail**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit -g resolveOrgFromConnection
```

Expected: FAIL — `resolveOrgFromConnection is not a function`.

- [x] **Step 2: Implement**

```ts
// append to _shared/facebook-lead-mapping.ts

export interface PageConnectionRow {
  organization_id: string;
  page_access_token: string | null;
  is_active: boolean;
}

export type OrgResolution =
  | { ok: true; organizationId: string; pageAccessToken: string | null }
  | { ok: false; reason: string };

/**
 * Decide which tenant a Page's leads belong to.
 *
 * Takes queryError as an explicit input: the original bug was destructuring
 * only `data`, so a hard schema error (42703) looked identical to "page not
 * found". Making the error a required argument means it cannot be dropped.
 *
 * There is deliberately NO org-list parameter. The removed fallback ("if
 * exactly one organization exists, use it") could route a stranger's leads
 * into an unrelated tenant; making it unrepresentable is the fix.
 */
export function resolveOrgFromConnection(args: {
  pageId: string | null | undefined;
  connection: PageConnectionRow | null;
  queryError: { code?: string; message?: string } | null;
}): OrgResolution {
  const { pageId, connection, queryError } = args;

  if (queryError) {
    return {
      ok: false,
      reason:
        `facebook_page_connections lookup failed for page_id=${pageId}: ` +
        `${queryError.code ?? "unknown"} ${queryError.message ?? ""}`.trim(),
    };
  }
  if (!pageId) {
    return { ok: false, reason: "Meta payload contained no page_id" };
  }
  if (!connection) {
    return {
      ok: false,
      reason:
        `page_id=${pageId} is not mapped to an organization — ` +
        `add a facebook_page_connections row before enabling this page`,
    };
  }
  if (!connection.is_active) {
    return { ok: false, reason: `page_id=${pageId} connection is inactive` };
  }
  return {
    ok: true,
    organizationId: connection.organization_id,
    pageAccessToken: connection.page_access_token,
  };
}
```

- [x] **Step 3: Run and watch them pass**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit
```

Expected: 24 of 28 pass. Only `classifyIngestionClaim` (Task 6) still fails.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/facebook-lead-mapping.ts
git commit -m "test: page->org resolution refuses on query error instead of discarding it"
```

---

## Task 4: Rewire `index.ts` onto the tested module

**Files:** Modify `supabase/functions/facebook-lead-webhook/index.ts:100-158`

**Interfaces — Consumes:** `mapMetaFieldData`, `buildLeadRow`, `resolveOrgFromConnection` (Tasks 2-3); `facebook_page_connections` (Task 1).

Leave lines 1-98 alone — GET verification, HMAC signature check, and raw-event storage all work and are verified live.

- [ ] **Step 1: Capture the raw-event id (feeds B1)**

Change the raw-event insert at `:72` so the row id is available:

```ts
const { data: rawEvent } = await supabase
  .from('facebook_lead_webhook_events')
  .insert({ payload: body })
  .select('id')
  .single();
const rawEventId = rawEvent?.id ?? null;
```

- [ ] **Step 2: Replace the lead-processing block**

```ts
import {
  mapMetaFieldData,
  buildLeadRow,
  resolveOrgFromConnection,
} from "../_shared/facebook-lead-mapping.ts";

// ... inside the `for (const change of entry.changes || [])` loop,
// replacing lines ~100-157:

if (change.field !== 'leadgen') continue;
const leadgenId = change.value?.leadgen_id;
const pageId = change.value?.page_id;
if (!leadgenId) {
  console.error("[facebook-lead-webhook] leadgen change with no leadgen_id");
  continue;
}

// 1. Which tenant? Note that BOTH data and error are captured.
const { data: connection, error: connError } = await supabase
  .from('facebook_page_connections')
  .select('organization_id, page_access_token, is_active')
  .eq('page_id', pageId)
  .maybeSingle();

const resolution = resolveOrgFromConnection({
  pageId,
  connection,
  queryError: connError,
});
if (!resolution.ok) {
  // Loud, and NOT retryable by Meta — a retry cannot create a mapping.
  console.error(
    `[facebook-lead-webhook] dropping leadgen_id=${leadgenId}: ${resolution.reason}`,
  );
  continue;
}
const { organizationId, pageAccessToken } = resolution;

// 2. Stamp the tenant onto the raw event so morning-brief can filter (B1).
if (rawEventId) {
  await supabase.from('facebook_lead_webhook_events')
    .update({ organization_id: organizationId })
    .eq('id', rawEventId);
}

// 3. Per-page token; env var only as the single-page fallback.
const token = pageAccessToken ?? Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
if (!token) {
  console.error(`[facebook-lead-webhook] no page access token for page_id=${pageId}`);
  continue;
}

// 4. Fetch the lead. encodeURIComponent: leadgenId is attacker-influenced.
const graphRes = await fetch(
  `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}` +
  `?access_token=${encodeURIComponent(token)}`,
);
const leadData = await graphRes.json();
if (leadData.error) {
  console.error("[facebook-lead-webhook] Graph API error:", leadData.error);
  continue;
}

// 5. Map and insert.
const fields = mapMetaFieldData(leadData.field_data);
const row = buildLeadRow({ fields, leadgenId, organizationId });

if (fields.email) {
  const { data: existing, error: dupErr } = await supabase
    .from('leads')
    .select('id')
    .eq('email', fields.email)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (dupErr) {
    console.error("[facebook-lead-webhook] dedupe check failed, skipping:", dupErr);
    continue;
  }
  if (existing) {
    console.log(`[facebook-lead-webhook] duplicate email, skipping leadgen_id=${leadgenId}`);
    continue;
  }
}

const { error: insertErr } = await supabase.from('leads').insert(row);
if (insertErr) {
  console.error(
    `[facebook-lead-webhook] lead insert FAILED for leadgen_id=${leadgenId}:`,
    insertErr,
  );
} else {
  console.log(
    `[facebook-lead-webhook] created lead org=${organizationId} leadgen_id=${leadgenId}`,
  );
}
```

Deletions this step must make, explicitly:
- the `business_settings` query at `:112-116`
- the `organizations ... limit(2)` fallback at `:121-122`
- `first_name` / `last_name` from the insert

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit -p tsconfig.app.json   # the -p flag is NOT optional
npm run lint
```

Note: `tsconfig.app.json` includes only `src`, so it will not typecheck the edge function. That is expected — the pure module's correctness is covered by the Task 2/3 unit tests, which do run through a TS transform. `eslint` ignores only `dist`, so `supabase/**` is linted.

- [ ] **Step 4: Deploy via Lovable** (a git push deploys nothing)

> Update the edge function `facebook-lead-webhook` and **deploy it**. Also create the new file `supabase/functions/_shared/facebook-lead-mapping.ts` exactly as committed in the repo, and import `mapMetaFieldData`, `buildLeadRow`, and `resolveOrgFromConnection` from it.
>
> Changes to `facebook-lead-webhook`: (1) replace the org lookup — query `facebook_page_connections` by `page_id` selecting `organization_id, page_access_token, is_active`, capture **both** `data` and `error`, and pass both into `resolveOrgFromConnection`; (2) **delete** the old `business_settings.facebook_page_id` query; (3) **delete** the "if exactly one organization exists, use it" fallback entirely; (4) replace the `leads` insert with `buildLeadRow(...)` — a single `name` column, never `first_name`/`last_name`, and `source` stays lowercase `'facebook'`; (5) use the per-page `page_access_token` when present, falling back to the `FACEBOOK_PAGE_ACCESS_TOKEN` env var; (6) wrap the leadgen id in `encodeURIComponent` in the Graph API URL.
>
> Confirm **deployed, not just committed**, and paste back the deployed function's source for the lead-insert block.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/facebook-lead-webhook/index.ts
git commit -m "fix: resolve FB page->org via mapping table; insert the columns leads actually has"
```

---

## Task 5: Live contract test — catches schema drift in both directions

**Files:**
- Test: `tests/facebook-lead-webhook.contract.spec.ts` (already written)
- Modify: `tests/security.spec.ts:16-30`

- [ ] **Step 1: Run the contract test and confirm the expected failures**

```bash
npx playwright test -c playwright.qa.config.ts \
  tests/facebook-lead-webhook.contract.spec.ts --project=chromium --no-deps
```

`--no-deps` is required. Without it Playwright runs the `setup` and `logout-check` projects first, and `logout-check` deliberately revokes **every** session for the shared test account (see the comment at `playwright.qa.config.ts:42-54`). Nothing in this spec needs a login.

**Measured RED baseline, 2026-08-12 — 10 failed, 15 passed.** The 10 failures are exactly the assertions gated on unbuilt migrations:

| Failing | Cleared by |
|---|---|
| `facebook_page_connections.{page_id,organization_id,is_active,page_access_token}` + "anon cannot read page_access_token" | Task 1 |
| `facebook_lead_ingestions.{leadgen_id,lead_id,organization_id}` + "anon cannot read the ledger" | Task 6 |
| `facebook_lead_webhook_events.organization_id` | **BLOCKER B1** |

The 15 that already pass: the three probe controls, the seven `leads` columns `buildLeadRow` writes, the two "`first_name`/`last_name` still does not exist" bug-documentation tests, and the three signature-gate tests. After Tasks 1 and 6 and B1, all 25 pass. That transition is the proof the migrations actually ran — not the presence of the files.

**A trap this file already fell into once, do not reintroduce it.** The first version asserted absence as `status === 400 && body.includes("42703")` and then asserted `expect(missing).toBe(false)`. All 22 tests passed against a database that had neither new table — because a missing **table** answers `404`/`PGRST205`, while `42703` is a missing **column**. Nine tests were vacuous. The helper now decides *presence* positively from the only two success shapes (`200`, or `401/403` + `42501`), treats everything else as absence, and carries a "table that does not exist" control test so the failure mode cannot come back silently. Measured response shapes are documented in the file header.

- [ ] **Step 2: Add the webhook to the security spec's public allowlist**

`tests/security.spec.ts:16-30` lists neither Facebook function, so its audit is stale. Add inside `KNOWN_PUBLIC`:

```ts
    // Meta Lead Ads webhook: public by necessity (Meta cannot send a JWT),
    // gated by HMAC-SHA256 over the raw body against META_APP_SECRET.
    // Verified 2026-08-12: unsigned POST -> 403, wrong-signature POST -> 403.
    "facebook-lead-webhook",
```

- [ ] **Step 3: Run the security spec**

```bash
npx playwright test -c playwright.qa.config.ts tests/security.spec.ts
```

Expected: no new failures versus the pre-change baseline. Capture the baseline first if unknown.

- [ ] **Step 4: Commit**

```bash
git add tests/facebook-lead-webhook.contract.spec.ts tests/security.spec.ts
git commit -m "test: live schema contract + signature-gate coverage for FB lead webhook"
```

---

## Task 6: Idempotency ledger — CONFIRMED IN

Meta retries any non-200. Without a ledger a retry re-runs the whole loop; phone-only leads have synthesized (always distinct) emails, so the email dedupe cannot catch them and you get duplicates. A duplicate lead means calling the same person twice.

**Files:**
- Create: `supabase/migrations/<timestamp>_facebook_lead_ingestions.sql`
- Modify: `supabase/functions/_shared/facebook-lead-mapping.ts`
- Modify: `supabase/functions/facebook-lead-webhook/index.ts`
- Test: `tests/facebook-lead-mapping.unit.spec.ts` (already written)

**Interfaces — Produces:** table `public.facebook_lead_ingestions`; `classifyIngestionClaim(error) => 'claimed' | 'duplicate' | 'failed'`; type `ClaimOutcome`.

- [x] **Step 1: Confirm the claim tests fail**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit -g classifyIngestionClaim
```

Expected: FAIL — `classifyIngestionClaim is not a function`.

- [x] **Step 2: Implement the classifier**

```ts
// append to _shared/facebook-lead-mapping.ts

export type ClaimOutcome = "claimed" | "duplicate" | "failed";

/**
 * Interpret the result of inserting the facebook_lead_ingestions claim row.
 *
 * 23505 (unique violation) on the leadgen_id PK is the ONLY code that means
 * "Meta retried something we already handled". Everything else is a real
 * failure and must not be mistaken for a duplicate, or the lead is lost.
 */
export function classifyIngestionClaim(
  error: { code?: string; message?: string } | null,
): ClaimOutcome {
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  return "failed";
}
```

- [x] **Step 3: Run and watch all 28 pass**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit
```

Expected: 28 passed.

- [ ] **Step 4: Write the migration**

```sql
-- Idempotency ledger for Meta Lead Ads. Meta retries any non-200 delivery;
-- the leadgen_id PK turns a retry into a no-op instead of a second lead.
-- Necessary because the email dedupe cannot help phone-only leads, whose
-- emails are synthesized per leadgen_id and therefore always distinct.
create table if not exists public.facebook_lead_ingestions (
  leadgen_id      text primary key,
  lead_id         uuid references public.leads(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists facebook_lead_ingestions_org_idx
  on public.facebook_lead_ingestions (organization_id, created_at desc);

alter table public.facebook_lead_ingestions enable row level security;
revoke all on public.facebook_lead_ingestions from anon, authenticated;
```

- [ ] **Step 5: Claim before insert, in `index.ts`**

Insert immediately after org resolution succeeds (Task 4 Step 2, section 3), before the Graph API fetch:

```ts
// Claim the leadgen_id FIRST so a Meta retry cannot create a second lead.
const { error: claimErr } = await supabase
  .from('facebook_lead_ingestions')
  .insert({ leadgen_id: leadgenId, organization_id: organizationId });
const claim = classifyIngestionClaim(claimErr);
if (claim === 'duplicate') {
  console.log(`[facebook-lead-webhook] leadgen_id=${leadgenId} already ingested, skipping`);
  continue;
}
if (claim === 'failed') {
  console.error("[facebook-lead-webhook] claim insert failed:", claimErr);
  continue;
}
```

And after the lead insert resolves — this half matters as much as the claim:

```ts
if (insertErr) {
  console.error(
    `[facebook-lead-webhook] lead insert FAILED for leadgen_id=${leadgenId}:`,
    insertErr,
  );
  // Release the claim so a genuine Meta retry can still succeed. Without
  // this, one transient failure blackholes the lead permanently.
  await supabase.from('facebook_lead_ingestions')
    .delete()
    .eq('leadgen_id', leadgenId);
} else {
  await supabase.from('facebook_lead_ingestions')
    .update({ lead_id: insertedLeadId })
    .eq('leadgen_id', leadgenId);
}
```

This requires the lead insert to return its id — change it to `.insert(row).select('id').single()` and capture `insertedLeadId`.

- [ ] **Step 6: Fold into the Task 4 Lovable prompt**

Add to the Task 4 deploy prompt: create `public.facebook_lead_ingestions` per the migration above (RLS on, grants revoked from anon/authenticated), and add the claim/release logic. Confirm the migration **ran** and the function is **deployed**.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/facebook-lead-mapping.ts \
        supabase/functions/facebook-lead-webhook/index.ts
git commit -m "feat: leadgen_id idempotency ledger so Meta retries cannot duplicate leads"
```

---

## Task 7: Check, then dispose of the orphaned `facebook-lead` function

`supabase/functions/facebook-lead/index.ts` hardcodes `TIDYWISE_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4"`, defaults `source` to capital-`"Facebook"` (invisible to `LeadsPage`'s strict filter), has zero callers in the repo, and is publicly reachable (`GET` returns its own 405, not a gateway 401 — so no JWT is enforced; its only gate is the `x-webhook-secret` header).

**Do not delete before checking.** Make.com is connected and something external may be posting to it.

- [ ] **Step 1: Check Supabase function logs for invocations in the last 90 days**

Ask Lovable: *"Show me all invocations of the `facebook-lead` edge function in the last 90 days — count, and the most recent timestamp."* An orphan in the repo can still be a live integration endpoint.

- [ ] **Step 2: Check Make.com for scenarios posting to it**

Scan Make scenarios for any HTTP module whose URL contains `functions/v1/facebook-lead`, and for any Facebook Lead Ads trigger. Claude has Make MCP access and can enumerate scenarios and their modules read-only.

- [ ] **Step 3: Decide**

- **If genuinely unused** (zero invocations AND no Make scenario): delete `supabase/functions/facebook-lead/`, ask Lovable to remove the deployed function, and remove any `config.toml` entry (there is none today).
- **If in use:** do **not** delete. Repair it instead — resolve `organization_id` through `facebook_page_connections` rather than the hardcoded UUID, and lowercase its `source` default. Note that a Make-driven path has no `page_id`, so it needs a different tenant key (an explicit `organization_slug` in the payload, matching `public-booking-submit`'s pattern at `:97-105`).

- [ ] **Step 4: Commit**

```bash
git add -A supabase/functions/facebook-lead
git commit -m "chore: remove orphaned single-tenant facebook-lead function"
```

---

## Task 8: Go-live verification (manual — the right tool for this)

`tests/NEEDS_ANOTHER_TOOL.md:98-104` already documents that item 14.4 cannot be driven by Playwright: this is a third party calling us. Use Meta's own tooling.

- [ ] **Gate: BLOCKER B1 verified applied and deployed** (Task 1 Steps 3-5). Do not proceed otherwise — the first real lead leaks Clean Collective's name into every other org's morning brief.
- [ ] Meta App Dashboard → app **TidyWise CRM** (`1068634425721355`) → **Lead Ads Testing Tool** → Page `1143280425539142` → create a test lead with name + email.
- [ ] Create a second **phone-only** test lead. This is the case that threw `23502` before this change — confirm the placeholder `fb-lead-<id>@facebook.invalid` appears.
- [ ] Confirm in Supabase logs: `[facebook-lead-webhook] created lead org=0ddb3567-4641-48c8-8ff7-4bf1b87681da leadgen_id=...`.
- [ ] In the app as a Clean Collective admin: Leads → filter Source = **Facebook** → both test leads visible. This is the lowercase-`source` assertion, end to end.
- [ ] Log in as a **different** org's admin → confirm neither test lead is visible (cross-org isolation).
- [ ] Re-send the same test lead from Meta's tool → confirm **no duplicate** (Task 6).
- [ ] Trigger or await a morning brief for a second org → confirm it lists **none** of Clean Collective's leads (B1).
- [ ] Delete the test leads and their `facebook_lead_ingestions` rows.

---

## Self-review

**Spec coverage.** Bug #1 → Tasks 1, 3, 4. Bug #2 → Tasks 2, 4, plus a live assertion in Task 5. Bug #3 (`email` NOT NULL) → Task 2. Bug #4 (single-org fallback) → Tasks 3, 4. Bug #5 (idempotency) → Task 6. Multi-tenant mapping with no hardcoded org → Task 1, which also clears the per-page-token blocker. "Find rather than assume Clean Collective's id" → verified via the public booking endpoint, and the migration seeds by slug lookup with a `raise exception` guard. Lowercase `source` → already correct in this function; locked by test in Task 2, end-to-end in Task 8; the real capital-F offender is Task 7. Morning-brief leak → BLOCKER B1, same Lovable session as Task 1, gating Task 8.

**Type consistency.** `mapMetaFieldData` → `MappedLeadFields` → `buildLeadRow` → `LeadInsertRow`. `resolveOrgFromConnection` consumes `PageConnectionRow`, whose three fields are exactly the three columns selected in Task 4's query. `classifyIngestionClaim` returns `ClaimOutcome`, consumed in Task 6 Step 5. Names match across all tasks and both spec files.

**Test-to-schema coupling.** The `WRITTEN` array in `facebook-lead-webhook.contract.spec.ts` and the `Object.keys(row).sort()` assertion in `facebook-lead-mapping.unit.spec.ts` describe the same seven columns from two directions — pure output shape, and live schema. If they drift apart, one of them fails. That is deliberate.

**Resolved during planning.** `facebook_lead_webhook_events` holds 0 rows with no `max(created_at)`, so Meta was never delivering, nothing was silently dropped, and the backfill task originally sketched as Task 9 is **dropped**.

**Still open, handled inline.** Unique constraints on `leads` are unverified — no migration declares one, but per rule 4b that is a hypothesis, not an answer. Task 1 Step 1 asks Lovable for the `pg_constraint` inventory before any insert logic is written.
