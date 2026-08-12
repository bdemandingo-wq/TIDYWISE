# Facebook Lead Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-off import of the ~29 existing Facebook Lead Ads leads for page `1143280425539142` into Clean Collective, with truthful arrival timestamps and a marker that prevents future speed-to-lead texting from firing at people who enquired weeks ago.

**Architecture:** A secret-gated, dry-run-by-default edge function walks the page's `leadgen_forms`, then each form's `leads`, and writes through the same tested pure module and the same `facebook_lead_ingestions` ledger the live webhook uses. Row shape is guaranteed identical by construction: `buildBackfillLeadRow` spreads `buildLeadRow` rather than rebuilding fields.

**Tech Stack:** Deno edge functions, Postgres/Supabase, Meta Graph API v21.0, Playwright as the test runner.

**Status:** Plan written 2026-08-12, approved decisions recorded below. Prerequisite work (live ingestion, Tasks 1/4/6 of the sibling plan) is shipped and verified — a real test lead landed in Clean Collective after the long-lived Page token was stored as `FACEBOOK_PAGE_ACCESS_TOKEN`.

**Sibling plan:** `2026-08-12-facebook-lead-ingestion.md` — read its "Verified during planning" table first; this plan builds directly on that schema.

## Global Constraints

- Reuse `mapMetaFieldData` and `buildLeadRow` from `_shared/facebook-lead-mapping.ts`. Backfilled rows must be identical in shape to live ones. That module has zero imports and no Deno globals; keep it that way or the unit tests stop being able to load it.
- Write through `facebook_lead_ingestions`, keyed on `leadgen_id`, so the backfill and the live webhook can never double-insert the same lead.
- No hardcoded `organization_id`. Resolve through `facebook_page_connections` + `resolveOrgFromConnection`, same as live.
- `supabase/**` ships only via a Lovable in-chat prompt that says *deploy*. A git push deploys nothing. Lovable's git mirror only tracks `main` plus backups, so **feature branches are invisible to it — any new shared file must be inlined into the prompt**, as learned on 2026-08-12.
- CLAUDE.md rule 5: no silent swallowing. Every lead Meta returns must appear in the run report as inserted, skipped, or failed, with a reason.
- `leads.status` must be one of the live eight: `new, contacted, qualified, follow_up, quoted, commercial, converted, lost`.

---

## Decisions (approved 2026-08-12)

### created_at: use Meta's `created_time`

Approved verbatim: *"These leads genuinely happened in July, and a lead's age is the single most important thing about it. I accept that Clean Collective's past-month lead counts will shift; showing when they actually arrived is more useful than keeping a wrong number stable."*

Consequences, accepted knowingly: `LeadsPage`'s month filter and CSV export, `weekly-business-report`, and `calculate-ai-intelligence` all read `created_at`, so Clean Collective's July figures will change once this runs. The rejected alternative — `created_at = now()` plus a separate `source_created_at` — was worse because every consumer would then have to know which field to trust.

Meta's format (`2026-07-20T14:03:00+0000`) is passed through **verbatim**. Postgres `timestamptz` accepts it as-is, and re-parsing or reformatting a timestamp is how timezone bugs get introduced.

### The marker: a column, `leads.backfilled_at timestamptz`

NULL means the lead arrived live. Non-null means it was imported. Chosen over a notes convention and over a created-at guard on the notifier, for five reasons:

1. **A notes convention is directly incompatible with the shape requirement.** `notes` is one of the seven fields `buildLeadRow` produces, so writing a `[BACKFILL]` marker into it makes a *shared* field differ.
2. **Discoverability.** A column appears in the generated `types.ts` `leads` Row type, so whoever builds the notifier meets it in autocomplete. A substring in free text is invisible until it bites.
3. **A user can erase notes.** `LeadsPage.tsx:191` lets an admin edit `notes`; someone tidying a note would silently re-arm the lead. `backfilled_at` is not in the edit form.
4. **Exact, indexable predicate.** `where backfilled_at is null` versus `notes not like '%BACKFILL%'` — the latter is a scan and breaks on any text edit.
5. **A fact with a timestamp, not an instruction** — it also audits when the import ran.

A created-at guard on the notifier is still wanted, as defence in depth, but it cannot be the marker: alone it depends on code that does not exist yet being written correctly, and a notifier keyed on an INSERT trigger or on `status='new'` never consults `created_at`.

---

## Safety finding: nothing fires on lead insert today

Checked before planning, because if anything did fire, running this would text 29 real people.

- **No `AFTER INSERT` trigger on `public.leads`.** The only trigger nearby is `update_lead_intelligence_updated_at`, on a different table.
- **`lead.created` dispatches from exactly one place:** `src/pages/admin/LeadsPage.tsx:179`, inside the frontend's manual create-lead mutation. Not from a trigger, not from any edge function.
- **`facebook-lead-webhook` sends nothing outbound.** Its only `fetch` is to the Graph API.

So a backfill today fires no Zapier, no GHL, no SMS. The marker is entirely prospective, which is precisely why it must be structural rather than a convention — its consumer does not exist yet and cannot be tested against.

**Related gap, tracked separately:** because `lead.created` only fires from that frontend mutation, live Facebook leads do not fire it either. See `2026-08-12-lead-created-dispatch-gap.md`. That is a blocker for the speed-to-lead work, which is the next piece after this backfill.

---

## File structure

| File | Responsibility |
|---|---|
| **Create** `supabase/migrations/<ts>_leads_backfilled_at.sql` | The marker column, its comment, and the partial index the future notifier will use |
| **Modify** `supabase/functions/_shared/facebook-lead-mapping.ts` | Add `buildBackfillLeadRow`, `parseLeadgenFormsPage`, `parseLeadsPage`. Still zero imports |
| **Create** `supabase/functions/backfill-facebook-leads/index.ts` | The one-off runner. Deleted after use |
| **Modify** `supabase/config.toml` | `[functions.backfill-facebook-leads] verify_jwt = false` — gated internally by `requireCronSecret` |
| **Create** `tests/facebook-lead-backfill.unit.spec.ts` | 22 pure unit tests ✅ written |
| **Create** `tests/facebook-lead-backfill.contract.spec.ts` | 14 live schema contract tests ✅ written (RED verified: 13 pass, 1 fails on `backfilled_at`) |

---

## Task B1: The marker column

**Files:** Create `supabase/migrations/<timestamp>_leads_backfilled_at.sql`
**Interfaces — Produces:** `public.leads.backfilled_at timestamptz` (nullable); partial index `leads_live_recent_idx`.

- [ ] **Step 1: Write the migration**

```sql
alter table public.leads add column if not exists backfilled_at timestamptz;

comment on column public.leads.backfilled_at is
  'Non-null when this row was imported from a historical source rather than '
  'arriving live. NULL means it arrived live. Outbound speed-to-lead '
  'automation MUST filter on `backfilled_at is null` - a backfilled row can be '
  'weeks old, and texting that person as a fresh enquiry is a real-world '
  'mistake, not just bad data.';

-- The exact predicate a future speed-to-lead notifier will run, made cheap now.
create index if not exists leads_live_recent_idx
  on public.leads (organization_id, created_at desc)
  where backfilled_at is null;
```

- [ ] **Step 2: Fold two verification queries into the same Lovable message**

One round trip. Both answer questions that would invalidate the plan if they came back wrong:

```sql
-- 1. Any trigger on leads that would overwrite created_at, or fire outbound?
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.leads'::regclass and not tgisinternal;

-- 2. Confirm created_at is plainly writable and backfilled_at landed.
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and column_name in ('created_at', 'updated_at', 'backfilled_at');
```

**Stop if query 1 returns a `BEFORE INSERT` trigger that sets `created_at`** — the truthful-timestamp decision would be silently overridden, and the whole point of this plan is the timestamps.

- [ ] **Step 3: Confirm the contract test flips green**

```bash
npx playwright test -c playwright.qa.config.ts \
  tests/facebook-lead-backfill.contract.spec.ts --project=chromium --no-deps
```

`leads.backfilled_at exists` fails before this task and passes after. That transition is the proof the migration ran, not the presence of the file.

---

## Task B2: Three pure functions, tests already written

**Files:** Modify `supabase/functions/_shared/facebook-lead-mapping.ts`; Test `tests/facebook-lead-backfill.unit.spec.ts` (written)
**Interfaces — Consumes:** `MappedLeadFields`, `MetaFieldDatum`, `LeadInsertRow`, `buildLeadRow`. **Produces:** `buildBackfillLeadRow`, `parseLeadgenFormsPage`, `parseLeadsPage`.

- [ ] **Step 1: Add throwing stubs so the spec links, then watch it fail properly**

The spec uses static named imports, so a missing export is a link-time `SyntaxError` and Playwright collects **zero** tests — a real RED but a coarse one that cannot tell 20 wired tests from a typo. Same lesson as the sibling plan. Add stubs first:

```ts
export function buildBackfillLeadRow(args: {
  fields: MappedLeadFields; leadgenId: string; organizationId: string;
  metaCreatedTime: string; backfilledAt: string;
}): LeadInsertRow & { created_at: string; backfilled_at: string } {
  throw new Error(`buildBackfillLeadRow not implemented (leadgen_id=${args.leadgenId})`);
}

export function parseLeadgenFormsPage(json: unknown): { formIds: string[]; next: string | null } {
  throw new Error(`parseLeadgenFormsPage not implemented (${typeof json})`);
}

export function parseLeadsPage(json: unknown): {
  leads: Array<{ leadgenId: string; createdTime: string; fieldData: MetaFieldDatum[] }>;
  skipped: Array<{ reason: string; raw: unknown }>;
  next: string | null;
} {
  throw new Error(`parseLeadsPage not implemented (${typeof json})`);
}
```

Run: `npx playwright test -c playwright.qa.config.ts --project=unit`

Note: until these stubs exist, a full `--project=unit` run collects **zero** tests, including the 28 that already pass — one unresolvable named import fails the whole project. The existing file still runs if targeted directly (`... --project=unit tests/facebook-lead-mapping.unit.spec.ts`, verified 28/28 on 2026-08-12). Adding the stubs is what restores the full run.
Expected: 28 existing pass, 22 new fail on `not implemented`. If any new test fails for another reason, fix that first.

- [ ] **Step 2: Implement `buildBackfillLeadRow`**

```ts
/**
 * A backfilled row: identical to a live one, plus a truthful arrival time and
 * the historical-import marker.
 *
 * The spread is deliberate and load-bearing. Rebuilding the seven shared fields
 * here would let them drift from the live path; spreading buildLeadRow makes
 * "identical in shape" true by construction rather than by discipline.
 */
export function buildBackfillLeadRow(args: {
  fields: MappedLeadFields;
  leadgenId: string;
  organizationId: string;
  /** Meta's `created_time`, passed through verbatim — do not re-parse it. */
  metaCreatedTime: string;
  /** When this backfill ran. Non-null is what marks the row historical. */
  backfilledAt: string;
}): LeadInsertRow & { created_at: string; backfilled_at: string } {
  const { fields, leadgenId, organizationId, metaCreatedTime, backfilledAt } = args;
  return {
    ...buildLeadRow({ fields, leadgenId, organizationId }),
    created_at: metaCreatedTime,
    backfilled_at: backfilledAt,
  };
}
```

- [ ] **Step 3: Implement the two parsers**

```ts
export function parseLeadgenFormsPage(json: unknown): { formIds: string[]; next: string | null } {
  const body = (json ?? {}) as { data?: unknown; paging?: { next?: unknown } };
  const rows = Array.isArray(body.data) ? body.data : [];
  const formIds: string[] = [];
  for (const row of rows) {
    const id = (row as { id?: unknown })?.id;
    if (typeof id === "string" && id) formIds.push(id);
  }
  const next = typeof body.paging?.next === "string" ? body.paging.next : null;
  return { formIds, next };
}

export function parseLeadsPage(json: unknown): {
  leads: Array<{ leadgenId: string; createdTime: string; fieldData: MetaFieldDatum[] }>;
  skipped: Array<{ reason: string; raw: unknown }>;
  next: string | null;
} {
  const body = (json ?? {}) as { data?: unknown; paging?: { next?: unknown } };
  const rows = Array.isArray(body.data) ? body.data : [];
  const leads: Array<{ leadgenId: string; createdTime: string; fieldData: MetaFieldDatum[] }> = [];
  const skipped: Array<{ reason: string; raw: unknown }> = [];

  for (const row of rows) {
    const r = row as { id?: unknown; created_time?: unknown; field_data?: unknown };
    if (typeof r?.id !== "string" || !r.id) {
      skipped.push({ reason: "lead has no id", raw: row });
      continue;
    }
    // Without a real timestamp we cannot honour the truthful-created_at
    // decision, and now() would make a July lead look like it arrived today.
    if (typeof r?.created_time !== "string" || !r.created_time) {
      skipped.push({ reason: `lead ${r.id} has no created_time`, raw: row });
      continue;
    }
    leads.push({
      leadgenId: r.id,
      createdTime: r.created_time,
      fieldData: Array.isArray(r.field_data) ? (r.field_data as MetaFieldDatum[]) : [],
    });
  }

  const next = typeof body.paging?.next === "string" ? body.paging.next : null;
  return { leads, skipped, next };
}
```

- [ ] **Step 4: Watch all 50 pass, and lint**

```bash
npx playwright test -c playwright.qa.config.ts --project=unit
npx eslint supabase/functions/_shared/facebook-lead-mapping.ts
grep -c '^import' supabase/functions/_shared/facebook-lead-mapping.ts   # must be 0
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/facebook-lead-mapping.ts tests/facebook-lead-backfill.unit.spec.ts
git commit -m "test: backfill row builder and Graph page parsers"
```

---

## Task B3: The backfill runner

**Files:** Create `supabase/functions/backfill-facebook-leads/index.ts`; Modify `supabase/config.toml`
**Interfaces — Consumes:** everything from B2, plus `resolveOrgFromConnection`, `mapMetaFieldData`, `classifyIngestionClaim`, and `requireCronSecret` from `_shared/requireCronSecret.ts`.

Follows the existing `backfill-openphone-messages` precedent (`verify_jwt = false`, verified internally, JSON body, resumable).

**Request:** `POST { pageId: string, dryRun?: boolean, maxLeads?: number }`, header `x-cron-secret`.

**Non-negotiable behaviours:**

| Behaviour | Why |
|---|---|
| `dryRun` defaults to **true** | Writing requires an explicit `dryRun: false`. Inverted default because this touches a real customer's records |
| In dry-run the ledger is only ever `SELECT`ed, never claimed | A dry run must leave zero trace |
| Org and token via `resolveOrgFromConnection` | No hardcoded org; per-page token with env fallback, same as live |
| `maxLeads` hard cap, default 100 | A bug cannot insert thousands |
| Claim-first through the ledger, release on insert failure | Byte-identical control flow to the live webhook, which is what makes double-insert impossible in either direction |
| Same email-dedupe rule as live | The two paths must not disagree about what a duplicate is |
| Per-lead outcome in the response | `inserted` / `would_insert` / `already_ingested` / `duplicate_email` / `insert_failed` / `skipped`, each with its `leadgen_id` and reason |

- [ ] **Step 1: Write the function**

Flow: gate → resolve org+token → `/{pageId}/leadgen_forms` paginated via `parseLeadgenFormsPage` → for each form `/{formId}/leads?limit=100` paginated via `parseLeadsPage` → per lead: ledger check → email check → `mapMetaFieldData` → `buildBackfillLeadRow` → claim → insert → backfill `lead_id` or release claim.

`backfilledAt` is computed **once** at the top of the run (`new Date().toISOString()`) and reused for every row, so one run is one identifiable batch.

- [ ] **Step 2: Add the config entry**

```toml
  [functions.backfill-facebook-leads]
    verify_jwt = false
```

- [ ] **Step 3: Deploy via Lovable**

The prompt must **inline the full new `_shared/facebook-lead-mapping.ts`** — Lovable cannot see feature branches, confirmed 2026-08-12. Generate the paste file programmatically from the committed module, as done for Task 4/6, rather than hand-copying it.

---

## Task B4: Verification

- [ ] **Step 1: Dry run**

```
POST /functions/v1/backfill-facebook-leads
x-cron-secret: <CRON_SECRET>
{ "pageId": "1143280425539142" }
```

Expected: ~29 `would_insert`, **plus the existing live test lead reported as `already_ingested`**. That single result is the proof the ledger interlock works — it is a real lead already present in both `leads` and `facebook_lead_ingestions`, so if it came back `would_insert`, the interlock is broken and nothing should be written.

- [ ] **Step 2: Reconcile the count before writing**

Compare the dry-run total against Meta Ads Manager's lead count for those forms. Investigate any gap before proceeding — a short count means forms or pages were missed, and `skipped` entries explain the rest.

- [ ] **Step 3: Real run**

```
{ "pageId": "1143280425539142", "dryRun": false }
```

- [ ] **Step 4: Verify the rows, via Lovable (anon cannot read `leads`)**

```sql
-- Every backfilled lead, with its truthful arrival date
select id, name, email, phone, source, status, created_at, backfilled_at
from public.leads
where organization_id = (select id from public.organizations where slug = 'clean-collective')
  and source = 'facebook'
order by created_at;

-- Shape checks: all marked, all in the right org, dates genuinely spread
select count(*) as total,
       count(backfilled_at) as marked,
       count(*) filter (where backfilled_at is null) as live_arrivals,
       min(created_at) as earliest,
       max(created_at) as latest
from public.leads
where source = 'facebook';

-- Ledger must have one row per lead, each linked
select count(*) as claims, count(lead_id) as linked
from public.facebook_lead_ingestions;
```

Expect: `marked` = 29, `live_arrivals` = 1 (the test lead), `earliest` in July rather than today, `claims` = 30 with `linked` = 30.

- [ ] **Step 5: Cross-org isolation**

Log in as an admin of a different org, filter Leads by Source = Facebook, confirm none of Clean Collective's leads appear.

- [ ] **Step 6: Prove idempotency rather than assuming it**

Re-run the real backfill unchanged. Expect 29 × `already_ingested`, zero inserts, and the counts from Step 4 unchanged.

- [ ] **Step 7: Delete the function**

Remove the directory and its `config.toml` entry, and ask Lovable to remove the deployed function. A secret-gated writer to a customer's `leads` table should not outlive its one use.

---

## Self-review

**Requirement coverage.** "Reuse `mapMetaFieldData` and `buildLeadRow`" → Task B2, enforced by the spread and verified field-by-field by the first unit test. "Write through the ledger keyed on `leadgen_id`" → Task B3's claim-first flow, proven by B4 Steps 1 and 6. "Mark backfilled rows so speed-to-lead cannot fire at them" → Task B1's column, with the decision and its four rejected alternatives recorded above.

**Type consistency.** `parseLeadsPage` returns `fieldData: MetaFieldDatum[]`, which is exactly `mapMetaFieldData`'s parameter type; its output `MappedLeadFields` is exactly `buildBackfillLeadRow`'s `fields` parameter. The round trip is asserted end-to-end in the "field_data comes out in the exact shape mapMetaFieldData consumes" test, so the chain is checked rather than assumed.

**What the tests cannot cover.** `leads` is RLS-protected and the anon key gets `401`/`42501`, so no automated test can count backfilled rows or check the `created_at` spread. Those assertions are Task B4 SQL for Lovable. Stated explicitly at the top of the contract spec so nobody later mistakes a green run for row-level proof.

**Open risk, fails loudly.** `/{form_id}/leads` needs the `leads_retrieval` permission, and possibly `pages_manage_ads`. The token demonstrably works for single-lead reads through the live webhook, but bulk form reads are a different edge. A missing permission returns an OAuth error rather than partial data, so the dry run surfaces it in one call before any effort is spent downstream.
