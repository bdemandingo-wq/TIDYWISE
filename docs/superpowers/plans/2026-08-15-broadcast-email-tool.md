# Platform Broadcast Email Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the platform admin compose a subject + body in the admin UI and send it to the owner of every organization — 96 recipients today — with per-recipient delivery accounting, a required transactional/marketing class, and an unsubscribe link appended at send time for marketing sends.

**Architecture:** The broadcast record *is* the queue. A `broadcasts` parent row plus one `broadcast_recipients` row per resolved owner holds subject, class, and per-recipient status. A cron-driven worker claims `queued` rows, sends through **Resend** from `support@tidywisecleaning.com`, and writes the outcome back to the same row. pgmq is deliberately **not** used — its messages are opaque, so it cannot answer "who didn't get it" or "retry the failures", which are hard requirements here. Audience comes from `organizations.owner_id → auth.users.email`, never from `org_memberships`.

**Tech Stack:** Postgres (Supabase), Deno edge functions, Resend HTTP API, React + TypeScript + react-query + shadcn, Playwright (unit + contract projects).

---

## Provider decision: Resend, not the Lovable lane

Decided, with reasons, because the plan depends on it:

1. **Identity.** Org owners already receive platform mail from `support@tidywisecleaning.com` via Resend — `send-welcome-email` records in-file that `tidywisecleaning.com` is the verified Resend domain. A broadcast must arrive from the same identity as the welcome email and the briefs. The Lovable lane takes `from`/`sender_domain` from the payload, but that domain's verification status on Lovable's side is unknown and not verifiable from here.
2. **Availability.** `process-email-queue` has an explicit `403 → "Emails disabled for this project" → DLQ` path. Lovable can switch that transport off. That is an unacceptable dependency for a "the site is down" notice.
3. **Precedent.** `admin-send-resubscribe-email` — the closest existing analogue (platform-admin gated, admin-triggered, platform-branded) — already uses Resend directly.
4. **The queue's value does not transfer.** Its retry/DLQ/TTL/dedupe are genuinely good, but a pgmq message is opaque. The required broadcast record forces a relational per-recipient table anyway, and once that table carries per-row status it *is* the queue. Running both means two sources of truth for one piece of state.
5. **Headroom.** Resend allows 10 req/s per team and a 100-email batch endpoint. 96 recipients at a 200 ms pace is ~20 seconds.
6. **The Lovable lane is unproven at volume.** Its entire lifetime traffic is 35 auth messages. (The 30 `failed` rows in `email_send_log` are all `payroll-period-report` failing on *org email identity*, not on transport — a different lane and a different bug.)

Trade-off accepted: the broadcast does not inherit the queue's throttle/TTL/DLQ. Task 5 reimplements the parts that matter — claim-before-send, bounded attempts, resumability — in ~40 lines against a table we need regardless.

---

## Global Constraints

- **Audience is `organizations.owner_id → auth.users.email`.** Never `org_memberships.role='owner'` — only 93 of 96 orgs have that row; the other 3 hold their owner as `role='member'`.
- **`message_class` is required with no default.** `NOT NULL` with no `DEFAULT`, CHECK-constrained to `('transactional','marketing')`.
- `transactional` reaches all 96. `marketing` skips opted-out owners and **must** carry an unsubscribe link appended at send time, never baked into the stored body.
- **Sender:** `TidyWise <support@tidywisecleaning.com>` via Resend (`RESEND_API_KEY`).
- **Server-side authorization is the only real gate.** `PlatformAdminRoute` is client-side. Every edge function authorizes with `is_platform_admin()` through a **user-scoped** client (Bearer forwarded), matching `admin-send-resubscribe-email:354`.
- **`config.toml`, per function.** `broadcast-admin` gets **no** entry — it is called from the browser with the admin's own JWT, so the default `verify_jwt = true` is correct. `broadcast-dispatch` gets `verify_jwt = false`, because pg_cron cannot present a user JWT and this project's vault has no service-role secret to forge one with; `requireCronSecret` is its internal authorization, which is exactly what CLAUDE.md rule 2 requires of a `verify_jwt = false` function. See `docs/bugs/2026-08-15-cron-bearer-null-vault-secret.md`. *(This constraint originally read "no entries for any new function". That was wrong for the cron worker and would have made the gateway 401 every tick.)*
- **Rule 3:** every `.range()`/paged query orders by a unique tiebreaker (`.order('id')`).
- **Rule 1:** no `Map`/`Set` inside any persisted react-query result.
- **Rule 4/4b:** verify against the live DB, not migration files.
- Typecheck is `npx tsc --noEmit -p tsconfig.app.json` — the `-p` is not optional.
- **Backend ships via Lovable.** `supabase/**` edits in this repo do not deploy. Each backend task's deliverable is a paste-ready prompt in `docs/superpowers/prompts/`, ending with "deploy the X function" / "run this migration" and "confirm deployed, not just committed."
- **Never write into `supabase/` from this repo — including via Bash.** The `block-lovable-territory` PreToolUse hook blocks Write/Edit/NotebookEdit there. Its Bash exemption is documented in the hook itself as "an acknowledged gap, not an oversight" — it exists so `git log` and `grep` keep working, and it is **not** permission to create files by heredoc.
- **No "reference copy" `.sql` files.** An earlier revision committed migrations under `supabase/migrations/` as a record of what was asked for. That was wrong twice over: the same SQL already lives verbatim inside the `.PASTE.txt`, so it is a pure duplicate that can drift; and a file sitting among 483 migrations that **never ran from this repo** is precisely the confusion CLAUDE.md rule 4 exists to warn about. The prompt file is the record. `20260815120000_broadcast_tables.sql` was deleted for this reason.
- **Modules needed on both sides follow the `src/lib/phone.ts` two-copy convention** — canonical in `src/lib/`, verbatim twin created by Lovable, colocated `node:test` suite importing both and asserting agreement. See "The two-copy convention" below.

### Live facts this plan is built on (verified 2026-08-15)

| Fact | Value |
|---|---|
| Organizations | 96, all with non-null non-orphaned `owner_id` |
| Distinct owner emails | 96 (clean 1:1) |
| Orgs with `role='owner'` membership | 93 — **3 short** |
| `org_memberships` roles in use | `member` 314, `owner` 93, `manager` 6, **`admin` 0** |
| `suppressed_emails` | 0 rows |
| `profiles.email_unsubscribed = true` | 1 |
| Owners suppressed / unsubscribed | 0 / 1 |
| `email_send_log_status_check` | does **not** include `rate_limited` |
| `email_queue_wake` triggers | attached to both pgmq queues, `FOR EACH STATEMENT` |

---

## File Structure

**Created — frontend (Claude Code owns):**
- `src/pages/admin/BroadcastPage.tsx` — compose form, class selector, preview, test-send, confirm dialog, list of past broadcasts.
- `src/pages/admin/BroadcastDetailPage.tsx` — per-broadcast status, recipient table, retry-failed action.
- `src/hooks/useBroadcasts.ts` — react-query hooks. Plain objects/arrays only.
- `src/lib/broadcast-render.ts` — **canonical** pure module: subject/body validation, HTML shell, unsubscribe-footer append. Zero imports, no Deno globals.
- `src/lib/broadcast-render.test.ts` — colocated `node:test` suite, including the KEEP IN SYNC check.

**Created — backend (ships via Lovable prompt):**
- `supabase/functions/_shared/broadcast-render.ts` — **verbatim copy** of `src/lib/broadcast-render.ts` below its header. Created by Lovable, never written from this repo.
- `supabase/functions/_shared/unsubscribe-token.ts` — mint-or-fetch a token for an email. Lovable-side only; it takes a Supabase client, so it is not unit-testable from `src/` and gets no canonical copy.
- `supabase/functions/broadcast-admin/index.ts` — create draft, resolve audience, test-send, start, retry-failed. Platform-admin gated.
- `supabase/functions/broadcast-dispatch/index.ts` — cron worker. Claims and sends.
- Migrations: `broadcasts`, `broadcast_recipients`, `broadcast_audience()`, `email_send_log` CHECK fix, cron job.

**Created — tests:**
- `src/lib/broadcast-render.test.ts` — colocated, `node:test` (see Task 3).
- `tests/broadcast-audience.contract.spec.ts` — Playwright, needs a live session.

### The two-copy convention (follow `src/lib/phone.ts` exactly)

Deno edge functions cannot import from `src/`, so a module needed on both sides exists twice. This repo already has the pattern and this plan must not invent a second one:

- **Canonical** copy lives in `src/lib/`, is import-free, and carries a `KEEP IN SYNC:` header naming its twin.
- **Verbatim copy** lives in `supabase/functions/_shared/`, identical below the header, and is **created by Lovable via a prompt** — never written from this repo. The `block-lovable-territory` PreToolUse hook enforces that; its Bash exemption is an acknowledged gap, **not** permission to route around it.
- The colocated `*.test.ts` imports **both** copies and asserts they agree. That test is **expected to fail until the Lovable paste lands** — it is the red half of the backend task, and going green is the proof the paste applied.
- Runner is `node:test`, no npm script: `node --experimental-strip-types --test src/lib/<name>.test.ts`

**Modified:**
- `src/App.tsx` — two lazy imports + two routes under `PlatformAdminRoute`.

**Not modified in this repo, by design:** `supabase/functions/process-email-queue/index.ts` and every other file under `supabase/functions/`. Lovable owns that tree and will write its own version; a local edit only creates drift. The `rate_limited` change ships as prompt text (Task 1), not as a repo edit. The reference `.sql` files under `supabase/migrations/` are committed as a record of what was asked for, never as the thing that runs.

---

## Task 1: Fix the discarded 429 log

Independent of everything else and shippable immediately. Live constraint confirmed 2026-08-15 as `('pending','sent','suppressed','failed','bounced','complained','dlq')`; the drain writes `'rate_limited'`, the insert fails `23514`, and the error is never checked — so every rate-limit event is silently lost. Evidence: zero `rate_limited` rows ever, alongside 55 `sent` / 35 `pending` / 30 `failed`.

Widen the constraint rather than changing the value — `rate_limited` is the more informative status, and `dlq`/`suppressed`/`bounced`/`complained` are already declared-but-unused, so the vocabulary is aspirational by design.

**Files:**
- Create: `docs/superpowers/prompts/2026-08-15-broadcast-T1-ratelimited.PASTE.txt` — **the only file this task creates or edits.**

Do **not** edit `supabase/functions/process-email-queue/index.ts` in this repo. Lovable owns that tree and writes its own version; a local edit creates drift and does not deploy. The code change travels as prompt text.

- [ ] **Step 1: Write the Lovable prompt**

Create `docs/superpowers/prompts/2026-08-15-broadcast-T1-ratelimited.PASTE.txt`:

```
Two small changes, both in the email pipeline.

1) MIGRATION — widen the email_send_log status vocabulary.

public.email_send_log has:
  CHECK (status = ANY (ARRAY['pending','sent','suppressed','failed','bounced','complained','dlq']))

But supabase/functions/process-email-queue/index.ts writes status:'rate_limited'
on every 429 from the email provider. That insert fails with 23514 and the code
never checks the error, so every rate-limit event has been silently discarded
since 2026-04-28. Confirmed: zero 'rate_limited' rows exist.

Run this migration:

  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending','sent','suppressed','failed','bounced',
                      'complained','dlq','rate_limited'));

2) EDGE FUNCTION — stop swallowing the error.

In supabase/functions/process-email-queue/index.ts, the rate-limit branch does:

  await supabase.from('email_send_log').insert({ ..., status: 'rate_limited', ... })

Capture and log the error so this can never fail silently again:

  const { error: rlLogError } = await supabase.from('email_send_log').insert({
    message_id: payload.message_id,
    template_name: payload.label || queue,
    recipient_email: payload.to,
    status: 'rate_limited',
    error_message: errorMsg.slice(0, 1000),
  })
  if (rlLogError) {
    console.error('Failed to log rate_limited event', { queue, msg_id: msg.msg_id, error: rlLogError })
  }

Do NOT change any other behaviour in that function.

Then: run the migration, deploy process-email-queue, and confirm deployed —
not just committed. Reply with the psql output of:
  SELECT pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conname = 'email_send_log_status_check';
```

- [ ] **Step 2: Commit the prompt**

```bash
git add docs/superpowers/prompts/2026-08-15-broadcast-T1-ratelimited.PASTE.txt
git commit -m "docs: Lovable prompt to fix discarded rate_limited email log"
```

- [ ] **Step 3: Hand the prompt to Lovable and verify live**

Paste into Lovable chat. When it reports done, verify the constraint actually changed — a migration file is not proof it ran (rule 4). Expect the returned definition to contain `rate_limited`.

- [ ] **Step 4: Confirm no regression in the drain**

Ask Lovable for the last 20 `email_send_log` rows. Expect the existing `sent`/`pending`/`failed` mix to be unchanged.

---

## Task 2: Broadcast schema and audience resolver

**Files:**
- Create: `docs/superpowers/prompts/2026-08-15-broadcast-T2-schema.PASTE.txt`
- Create (reference copy, does not deploy): `supabase/migrations/20260815120000_broadcast_tables.sql`

**Interfaces:**
- Produces: tables `public.broadcasts`, `public.broadcast_recipients`; function `public.broadcast_audience(p_message_class text)` returning `(organization_id uuid, user_id uuid, email text, eligible boolean, skip_reason text)`.

Design notes that are load-bearing:

- **`unique (broadcast_id, email)`** is what makes "three admins in one org don't get three copies" structurally true rather than true-by-current-data. Today's audience is 1:1, so it never fires — that is the point.
- The resolver returns **skipped rows too**, with a reason. Filtering them out at query time would make "who didn't get it" unanswerable, which is a stated requirement.
- Opt-out is checked against **both** stores. They currently disagree — 1 unsubscribed profile, 0 suppression rows — so checking either alone is wrong.
- `broadcast_audience` is `SECURITY DEFINER` because it reads `auth.users`, and therefore authorizes internally via `is_platform_admin()` in its own WHERE clause (rule 2, same shape as `has_openphone_api_key`).

- [ ] **Step 1: Write the migration SQL as a reference file**

Create `supabase/migrations/20260815120000_broadcast_tables.sql`:

```sql
-- Platform broadcast email: parent record + per-recipient ledger.
-- The recipient table IS the queue. pgmq is deliberately not used: its
-- messages are opaque, so it cannot answer "who didn't get it" or
-- "retry the failures", which are hard requirements for this feature.

create table if not exists public.broadcasts (
  id                   uuid primary key default gen_random_uuid(),
  subject              text not null check (length(btrim(subject)) between 1 and 200),
  body_text            text not null check (length(btrim(body_text)) >= 1),
  -- No DEFAULT. A broadcast must state its class explicitly; defaulting
  -- either way silently mislabels one of the two kinds of message.
  message_class        text not null check (message_class in ('transactional','marketing')),
  status               text not null default 'draft'
                         check (status in ('draft','sending','sent','failed','cancelled')),
  created_by           uuid not null references auth.users(id),
  recipient_count      integer not null default 0,
  sent_count           integer not null default 0,
  failed_count         integer not null default 0,
  skipped_count        integer not null default 0,
  audience_resolved_at timestamptz,
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.broadcast_recipients (
  id                  uuid primary key default gen_random_uuid(),
  broadcast_id        uuid not null references public.broadcasts(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  user_id             uuid not null,
  email               text not null,
  status              text not null default 'queued'
                        check (status in ('queued','sending','sent','failed','skipped')),
  skip_reason         text,
  provider_message_id text,
  error_message       text,
  attempts            integer not null default 0,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One copy per person per broadcast, enforced by Postgres rather than by
  -- an application branch that a future audience change could refactor away.
  unique (broadcast_id, email)
);

create index if not exists idx_broadcast_recipients_claim
  on public.broadcast_recipients (broadcast_id, status, id);
create index if not exists idx_broadcast_recipients_status
  on public.broadcast_recipients (status) where status = 'queued';

alter table public.broadcasts            enable row level security;
alter table public.broadcast_recipients  enable row level security;

revoke all on public.broadcasts           from anon, authenticated;
revoke all on public.broadcast_recipients from anon, authenticated;
grant all  on public.broadcasts           to service_role;
grant all  on public.broadcast_recipients to service_role;

-- Read-only visibility for the platform admin UI. is_platform_admin() is
-- SECURITY DEFINER but authorizes on auth.uid() internally, so this is the
-- same shape as the existing account_deletion_requests policy.
grant select on public.broadcasts           to authenticated;
grant select on public.broadcast_recipients to authenticated;

create policy "Platform admins can view broadcasts"
  on public.broadcasts for select to authenticated
  using (public.is_platform_admin());

create policy "Platform admins can view broadcast recipients"
  on public.broadcast_recipients for select to authenticated
  using (public.is_platform_admin());

-- Audience resolver. Reads auth.users, so SECURITY DEFINER — and therefore
-- authorizes the caller in its own WHERE clause (CLAUDE.md rule 2).
--
-- DISTINCT ON (lower(email)) rather than one row per org: the invariant that
-- matters is "one message per person". Today owner->email is 1:1 across all
-- 96 orgs, so this changes nothing now and prevents a duplicate later.
--
-- Skipped recipients are RETURNED, not filtered. "Who didn't get it" is a
-- product requirement, and a row that vanishes cannot answer it.
create or replace function public.broadcast_audience(p_message_class text)
returns table (
  organization_id uuid,
  user_id         uuid,
  email           text,
  eligible        boolean,
  skip_reason     text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (lower(u.email))
    o.id,
    o.owner_id,
    lower(u.email),
    case
      when p_message_class = 'transactional' then true
      when p.email_unsubscribed is true      then false
      when s.email is not null               then false
      else true
    end,
    case
      when p_message_class = 'transactional' then null
      when p.email_unsubscribed is true      then 'unsubscribed'
      when s.email is not null               then 'suppressed'
      else null
    end
  from public.organizations o
  join auth.users u             on u.id = o.owner_id
  left join public.profiles p   on p.id = o.owner_id
  left join public.suppressed_emails s on lower(s.email) = lower(u.email)
  where u.email is not null
    and p_message_class in ('transactional','marketing')
    and public.is_platform_admin()
  order by lower(u.email), o.created_at asc;
$$;

revoke all on function public.broadcast_audience(text) from public, anon;
grant execute on function public.broadcast_audience(text) to authenticated, service_role;
```

- [ ] **Step 2: Write the Lovable prompt**

Create `docs/superpowers/prompts/2026-08-15-broadcast-T2-schema.PASTE.txt` containing the sentence "Run the migration below against the live database." followed by the exact SQL from Step 1, then:

```
After running it, reply with the output of all four of these:

  SELECT count(*) FROM public.broadcast_audience('transactional');   -- expect 96
  SELECT count(*) FROM public.broadcast_audience('marketing') WHERE eligible;  -- expect 95
  SELECT skip_reason, count(*) FROM public.broadcast_audience('marketing')
    WHERE NOT eligible GROUP BY skip_reason;                         -- expect unsubscribed | 1
  SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'public.broadcast_recipients'::regclass AND contype = 'u';

Do not create any edge function in this step. Migration only.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260815120000_broadcast_tables.sql \
        docs/superpowers/prompts/2026-08-15-broadcast-T2-schema.PASTE.txt
git commit -m "feat: broadcast tables + audience resolver (migration + Lovable prompt)"
```

- [ ] **Step 4: Run via Lovable and check the counts**

The four expected numbers are the test. `transactional` = 96, `marketing` eligible = 95, one `unsubscribed` skip, and a unique constraint on `(broadcast_id, email)`. If `transactional` returns anything other than 96, stop — the audience query is wrong and every later task inherits it.

---

## Task 3: Canonical render module + colocated tests

Pure and zero-import, following `src/lib/phone.ts` exactly — canonical copy in `src/lib/`, verbatim twin created later by Lovable, colocated `node:test` suite asserting the two agree. This is where the "appended at send time" rule is made structural.

**Files:**
- Create: `src/lib/broadcast-render.ts`
- Create: `src/lib/broadcast-render.test.ts`

Do **not** create `supabase/functions/_shared/broadcast-render.ts` from this repo. The `block-lovable-territory` hook blocks it, and its Bash exemption is an acknowledged gap rather than permission. Task 4's prompt ships that copy.

**Interfaces:**
- Produces: `validateBroadcastInput({subject, bodyText, messageClass})`, `renderBroadcastHtml({bodyText, unsubscribeUrl})`, `renderBroadcastText({bodyText, unsubscribeUrl})`, `UNSUBSCRIBE_SENTENCE`, `MessageClass`.
- Consumed by Task 4, Task 5, and the frontend preview in Task 7.

**Expected end state: 12 of 13 tests passing.** The thirteenth — "the Deno copy behaves identically" — fails with a module-not-found error until Task 4's paste lands. That is deliberate and matches `phone.test.ts`: it is the red half of Task 4, and it going green is the proof the paste applied. Do not delete it, skip it, or guard it behind a try/catch to make the run green.

- [ ] **Step 1: Write the failing test**

Create `src/lib/broadcast-render.test.ts`:

```ts
// Broadcast rendering: the two product rules, and the controls that make this
// suite capable of failing.
//
// Runner: node:test. The module is import-free, so Node v24 strips the types
// natively and no bundler is involved:
//
//   node --experimental-strip-types --test src/lib/broadcast-render.test.ts
//
// There is no npm script for this, matching src/lib/phone.test.ts.
//
// TWO CONTROLS ARE DELIBERATE HERE. An implementation that appended the footer
// unconditionally would satisfy every "marketing has a footer" assertion, and
// one that never appended it would satisfy every "transactional has none" —
// so each rule needs its opposite asserted too:
//
//   1. "CONTROL: the two classes differ ONLY by the footer" — kills both the
//      always-append and never-append bugs in one assertion
//   2. "CONTROL: escaping applies to the body, not to our own constant" —
//      kills the over-escaping bug that made the constant unmatchable
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBroadcastInput,
  renderBroadcastHtml,
  renderBroadcastText,
  UNSUBSCRIBE_SENTENCE,
} from './broadcast-render.ts';

const URL_ = 'https://x.test/u?token=abc';

// ─── validateBroadcastInput ────────────────────────────────────────────────

test('message_class has no default — absent is a validation error', () => {
  const r = validateBroadcastInput({ subject: 'Hi', bodyText: 'Body', messageClass: undefined });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('message_class is required'));
});

test('rejects an unknown message_class', () => {
  const r = validateBroadcastInput({ subject: 'Hi', bodyText: 'Body', messageClass: 'promo' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('message_class must be transactional or marketing'));
});

test('accepts a valid transactional input', () => {
  const r = validateBroadcastInput({ subject: 'Hi', bodyText: 'Body', messageClass: 'transactional' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('rejects blank subject and blank body', () => {
  const r = validateBroadcastInput({ subject: '   ', bodyText: '\n', messageClass: 'marketing' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('subject is required'));
  assert.ok(r.errors.includes('body is required'));
});

test('rejects a subject over 200 characters', () => {
  const r = validateBroadcastInput({ subject: 'x'.repeat(201), bodyText: 'B', messageClass: 'marketing' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('subject must be 200 characters or fewer'));
});

// ─── renderBroadcastHtml ───────────────────────────────────────────────────

test('marketing render appends the unsubscribe link; the stored body never contains it', () => {
  const bodyText = 'Two weeks free, on us.';
  const html = renderBroadcastHtml({ bodyText, unsubscribeUrl: URL_ });
  assert.ok(html.includes(URL_));
  assert.ok(html.includes(UNSUBSCRIBE_SENTENCE));
  assert.ok(!bodyText.toLowerCase().includes('unsubscribe'));
});

test('transactional render passes no url and emits no unsubscribe footer', () => {
  const html = renderBroadcastHtml({ bodyText: 'The site is down.', unsubscribeUrl: null });
  assert.ok(!html.includes(UNSUBSCRIBE_SENTENCE));
  assert.ok(!html.toLowerCase().includes('unsubscribe'));
});

test('CONTROL: the two classes differ ONLY by the footer', () => {
  // Kills both degenerate implementations at once: always-append and
  // never-append. The body half must be byte-identical across classes.
  const bodyText = 'Same body, both classes.';
  const tx = renderBroadcastHtml({ bodyText, unsubscribeUrl: null });
  const mk = renderBroadcastHtml({ bodyText, unsubscribeUrl: URL_ });
  assert.notEqual(tx, mk, 'marketing and transactional renders must differ');
  const footerStart = mk.indexOf('<hr');
  assert.ok(footerStart > -1, 'marketing render must carry an <hr> footer');
  assert.equal(
    mk.slice(0, footerStart).trim(),
    tx.slice(0, tx.indexOf('</div>')).trim().replace(/<\/div>$/, '').trim(),
    'the body half must be identical across classes',
  );
});

test('body is HTML-escaped — a broadcast is not an HTML injection vector', () => {
  const html = renderBroadcastHtml({
    bodyText: '<script>alert(1)</script> & "quoted"',
    unsubscribeUrl: null,
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
});

test('CONTROL: escaping applies to the body, not to our own constant', () => {
  // UNSUBSCRIBE_SENTENCE contains an apostrophe. Escaping it turns "You're"
  // into "You&#39;re", which still RENDERS correctly but makes the constant
  // unmatchable in the source — and any test asserting the footer contains it
  // can then never pass. Escaping belongs on bodyText and unsubscribeUrl,
  // which are the actual injection surfaces; the constant is compile-time and
  // ours. Both halves are asserted so neither can regress alone.
  const html = renderBroadcastHtml({ bodyText: "it's <b>bold</b>", unsubscribeUrl: URL_ });
  assert.ok(html.includes(UNSUBSCRIBE_SENTENCE), 'our constant must appear verbatim');
  assert.ok(html.includes('&#39;s &lt;b&gt;'), 'the body must still be escaped');
});

test('newlines become paragraphs, not a single run-on line', () => {
  const html = renderBroadcastHtml({ bodyText: 'One\n\nTwo', unsubscribeUrl: null });
  assert.ok(html.includes('One'));
  assert.ok(html.includes('Two'));
  assert.ok((html.match(/<p[ >]/g) ?? []).length >= 2);
});

test('plain-text alternative carries the same unsubscribe url', () => {
  const txt = renderBroadcastText({ bodyText: 'Hello', unsubscribeUrl: URL_ });
  assert.ok(txt.includes('Hello'));
  assert.ok(txt.includes(URL_));
});

// ─── the two-copy invariant ────────────────────────────────────────────────

test('the Deno copy behaves identically', async () => {
  // src/lib/broadcast-render.ts is canonical and tested here; the edge
  // functions run in Deno and cannot import from src/, so
  // supabase/functions/_shared/broadcast-render.ts is a verbatim copy below
  // its header. Same arrangement as phone.ts and automation-templates.
  //
  // THIS TEST FAILS UNTIL THE LOVABLE PASTE IS APPLIED. That is the point: it
  // is the red half of Task 4, and it goes green when the Deno copy lands.
  const shared = await import('../../supabase/functions/_shared/broadcast-render.ts');

  const bodies = ['plain', "it's <b>x</b> & y", 'One\n\nTwo', '', '   '];
  const urls: (string | null)[] = [null, URL_];

  assert.equal(shared.UNSUBSCRIBE_SENTENCE, UNSUBSCRIBE_SENTENCE, 'constant diverges');

  for (const bodyText of bodies) {
    for (const unsubscribeUrl of urls) {
      assert.equal(
        shared.renderBroadcastHtml({ bodyText, unsubscribeUrl }),
        renderBroadcastHtml({ bodyText, unsubscribeUrl }),
        `renderBroadcastHtml diverges on ${JSON.stringify([bodyText, unsubscribeUrl])}`,
      );
      assert.equal(
        shared.renderBroadcastText({ bodyText, unsubscribeUrl }),
        renderBroadcastText({ bodyText, unsubscribeUrl }),
        `renderBroadcastText diverges on ${JSON.stringify([bodyText, unsubscribeUrl])}`,
      );
    }
  }

  for (const messageClass of ['transactional', 'marketing', 'promo', undefined]) {
    assert.deepEqual(
      shared.validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass }),
      validateBroadcastInput({ subject: 'S', bodyText: 'B', messageClass }),
      `validateBroadcastInput diverges on ${JSON.stringify(messageClass)}`,
    );
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --experimental-strip-types --test src/lib/broadcast-render.test.ts`
Expected: every test fails — cannot find module `./broadcast-render.ts`.

- [ ] **Step 3: Write the module**

Create `src/lib/broadcast-render.ts`:

```ts
/**
 * Pure rendering + validation for platform broadcast emails.
 *
 * Deliberately ZERO imports and no Deno globals, so Node v24 can strip the
 * types natively and the colocated test needs no bundler.
 *
 * KEEP IN SYNC: `supabase/functions/_shared/broadcast-render.ts` is a verbatim
 * copy below this header, because the senders run in Deno and cannot import
 * from `src/`. This copy is canonical. broadcast-render.test.ts imports both
 * and asserts they agree; that test is red until the Lovable paste lands.
 *
 * The load-bearing rule encoded here: the unsubscribe line is appended at
 * RENDER time from a url the caller supplies, and is never part of the stored
 * body. This mirrors withStopSentence() on the SMS side, and for the same
 * reason — an operator rewording their copy must not be able to drop it.
 */

export const UNSUBSCRIBE_SENTENCE = "You're receiving this because you own a TidyWise account.";

export const MAX_SUBJECT = 200;

export type MessageClass = 'transactional' | 'marketing';

export interface BroadcastInput {
  subject?: unknown;
  bodyText?: unknown;
  messageClass?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateBroadcastInput(input: BroadcastInput): ValidationResult {
  const errors: string[] = [];

  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.bodyText === 'string' ? input.bodyText.trim() : '';

  if (!subject) errors.push('subject is required');
  else if (subject.length > MAX_SUBJECT) errors.push(`subject must be ${MAX_SUBJECT} characters or fewer`);

  if (!body) errors.push('body is required');

  // Absent and invalid are separate errors: "required" is what the UI shows
  // when nothing is picked, and there is deliberately no default to fall back
  // to — a wrong class mislabels either a service notice or an ad.
  if (input.messageClass === undefined || input.messageClass === null || input.messageClass === '') {
    errors.push('message_class is required');
  } else if (input.messageClass !== 'transactional' && input.messageClass !== 'marketing') {
    errors.push('message_class must be transactional or marketing');
  }

  return { ok: errors.length === 0, errors };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Split on blank lines into paragraphs; single newlines become <br>. */
function paragraphs(bodyText: string): string {
  return bodyText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export function renderBroadcastHtml(args: {
  bodyText: string;
  unsubscribeUrl: string | null;
}): string {
  const { bodyText, unsubscribeUrl } = args;

  // UNSUBSCRIBE_SENTENCE is NOT escaped. It is a compile-time constant we own,
  // not an injection surface, and escaping it turns "You're" into "You&#39;re"
  // — which renders fine but makes the constant unmatchable in the source, so
  // any assertion that the footer contains it can never pass. escapeHtml stays
  // on bodyText and unsubscribeUrl, which are the values that actually arrive
  // from outside. renderBroadcastText already emits the constant unescaped, so
  // this also keeps the two renderers consistent.
  const footer = unsubscribeUrl
    ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">
${UNSUBSCRIBE_SENTENCE}
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a>.
</p>`
    : '';

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111827;max-width:560px;margin:0 auto;padding:24px">
${paragraphs(bodyText)}
${footer}
</div>`;
}

export function renderBroadcastText(args: {
  bodyText: string;
  unsubscribeUrl: string | null;
}): string {
  const { bodyText, unsubscribeUrl } = args;
  if (!unsubscribeUrl) return bodyText.trim();
  return `${bodyText.trim()}\n\n---\n${UNSUBSCRIBE_SENTENCE}\nUnsubscribe: ${unsubscribeUrl}`;
}
```

- [ ] **Step 4: Run the tests and check the split**

Run: `node --experimental-strip-types --test src/lib/broadcast-render.test.ts`

Expected: **12 pass, 1 fail, 13 total.** The only failure must be `the Deno copy behaves identically`, and its message must be a module-resolution error for `../../supabase/functions/_shared/broadcast-render.ts`. Any other failure is a real defect — fix it. If that test fails for any reason *other* than the missing module, that is also a real defect.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
git add src/lib/broadcast-render.ts src/lib/broadcast-render.test.ts
git commit -m "feat: canonical broadcast render module with append-at-send unsubscribe"
```

---

## Task 4: `broadcast-admin` edge function

Create the draft, materialize recipients, test-send, start, retry. One function with an `action` field rather than five functions — they share auth, validation, and the render module, and splitting them would duplicate all three.

**Files:**
- Create: `supabase/functions/broadcast-admin/index.ts`
- Create: `supabase/functions/_shared/unsubscribe-token.ts`
- Create: `docs/superpowers/prompts/2026-08-15-broadcast-T4-admin-fn.PASTE.txt`

**Interfaces:**
- Consumes: `validateBroadcastInput`, `renderBroadcastHtml`, `renderBroadcastText` (Task 3); `broadcast_audience(text)`, `broadcasts`, `broadcast_recipients` (Task 2).
- Produces: `POST /broadcast-admin` with `{action}` ∈ `create | test_send | start | retry_failed`, each returning JSON. Consumed by Task 7 and Task 8.

- [ ] **Step 1: Write the unsubscribe-token helper**

Create `supabase/functions/_shared/unsubscribe-token.ts`:

```ts
/**
 * Mint-or-fetch the unsubscribe token for an email address.
 *
 * public.email_unsubscribe_tokens.email is UNIQUE, so both this and the
 * existing minting inside _shared/emailEligibility.ts converge on the same
 * row — a broadcast and a Morning Brief hand out the same link.
 *
 * Left as an additive module rather than refactoring emailEligibility: the
 * briefs are the only email path in the system that currently honours
 * opt-out, and there is no user-visible benefit to touching them here.
 * Follow-up: fold emailEligibility onto this helper.
 */
export async function ensureUnsubscribeToken(
  supabase: { from: (t: string) => any },
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ email: normalized, token });

  if (error) {
    // 23505 means a concurrent mint won the race — re-read rather than fail,
    // because a missing token would silently downgrade a marketing send into
    // one with no way out.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', normalized)
        .maybeSingle();
      return raced?.token ?? null;
    }
    console.error('[unsubscribe-token] mint failed', { error });
    return null;
  }
  return token;
}
```

- [ ] **Step 2: Write the admin function**

Create `supabase/functions/broadcast-admin/index.ts`:

```ts
// Platform broadcast admin API. Four actions behind one entry point, because
// they share auth, validation and rendering.
//
// AUTH: is_platform_admin() through a USER-SCOPED client. PlatformAdminRoute
// is client-side only and is not a security boundary. No config.toml entry —
// default verify_jwt = true applies (CLAUDE.md rule 2).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateBroadcastInput,
  renderBroadcastHtml,
  renderBroadcastText,
} from "../_shared/broadcast-render.ts";
import { ensureUnsubscribeToken } from "../_shared/unsubscribe-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM = "TidyWise <support@tidywisecleaning.com>";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // User-scoped: is_platform_admin() reads auth.uid(), so it must run as the
  // caller. A service-role client would make it return false for everyone.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_platform_admin");
  if (adminErr) {
    console.error("[broadcast-admin] admin check failed", adminErr);
    return json({ error: "Authorization check failed" }, 500);
  }
  if (!isAdmin) {
    console.warn("[SECURITY] non-platform-admin hit broadcast-admin", { userId: userData.user.id });
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = typeof body.action === "string" ? body.action : "";

  // ── create: validate, insert the draft, materialize every recipient ──
  if (action === "create") {
    const check = validateBroadcastInput({
      subject: body.subject,
      bodyText: body.body_text,
      messageClass: body.message_class,
    });
    if (!check.ok) return json({ error: "Validation failed", errors: check.errors }, 400);

    const subject = (body.subject as string).trim();
    const bodyText = (body.body_text as string).trim();
    const messageClass = body.message_class as string;

    const { data: broadcast, error: insErr } = await admin
      .from("broadcasts")
      .insert({
        subject,
        body_text: bodyText,
        message_class: messageClass,
        created_by: userData.user.id,
        status: "draft",
      })
      .select("id")
      .single();
    if (insErr) return json({ error: `create failed: ${insErr.message}` }, 500);

    // Resolve through the user-scoped client: broadcast_audience() gates on
    // is_platform_admin(), which needs auth.uid().
    const { data: audience, error: audErr } = await userClient.rpc("broadcast_audience", {
      p_message_class: messageClass,
    });
    if (audErr) return json({ error: `audience failed: ${audErr.message}` }, 500);

    const rows = (audience ?? []).map((a: Record<string, unknown>) => ({
      broadcast_id: broadcast.id,
      organization_id: a.organization_id,
      user_id: a.user_id,
      email: a.email,
      status: a.eligible ? "queued" : "skipped",
      skip_reason: a.eligible ? null : a.skip_reason,
    }));

    // An empty audience is never legitimate here — there are 96 orgs. It means
    // the resolver was called with the wrong client (service-role sees zero
    // rows, because broadcast_audience gates on auth.uid()) or the join broke.
    // Failing loudly beats returning 200 with a broadcast nobody will receive.
    if (rows.length === 0) {
      await admin.from("broadcasts").delete().eq("id", broadcast.id);
      return json(
        { error: "audience resolved to 0 recipients — refusing to create an empty broadcast" },
        500,
      );
    }

    const { error: recErr } = await admin.from("broadcast_recipients").insert(rows);
    if (recErr) return json({ error: `recipients failed: ${recErr.message}` }, 500);

    const skipped = rows.filter((r) => r.status === "skipped").length;

    // Checked, not fire-and-forget. These counters are what the Task 8 UI reads
    // to answer "did it finish". A silent failure here leaves recipient_count
    // at 0 while 96 recipient rows exist — the UI would report an empty
    // broadcast that is about to send to everyone. CLAUDE.md rule 5.
    const { error: countErr } = await admin
      .from("broadcasts")
      .update({
        recipient_count: rows.length,
        skipped_count: skipped,
        audience_resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);
    if (countErr) {
      return json(
        { error: `recipients created but counters failed: ${countErr.message}`, broadcast_id: broadcast.id },
        500,
      );
    }

    return json({
      broadcast_id: broadcast.id,
      total: rows.length,
      queued: rows.length - skipped,
      skipped,
    });
  }

  // ── test_send: render exactly as production and send to the admin only ──
  if (action === "test_send") {
    const id = typeof body.broadcast_id === "string" ? body.broadcast_id : "";
    if (!id) return json({ error: "broadcast_id is required" }, 400);

    // Error and not-found are different answers. Collapsing them renders a
    // broken query as "broadcast not found", which sends the operator looking
    // for a missing row instead of a failing database. CLAUDE.md rule 5.
    const { data: b, error: bErr } = await admin
      .from("broadcasts")
      .select("subject, body_text, message_class")
      .eq("id", id)
      .maybeSingle();
    if (bErr) return json({ error: `broadcast lookup failed: ${bErr.message}` }, 500);
    if (!b) return json({ error: "broadcast not found" }, 404);

    const to = userData.user.email!;

    // A null token must never be interpolated. `?token=${null}` yields the
    // literal string "?token=null", which is a dead unsubscribe link — a
    // marketing email with no working way out is the one thing this feature
    // must not produce. Fail the send instead, and say why.
    let unsubscribeUrl: string | null = null;
    if (b.message_class === "marketing") {
      const token = await ensureUnsubscribeToken(admin, to);
      if (!token) {
        return json({ error: "could not mint an unsubscribe token — marketing send aborted" }, 500);
      }
      unsubscribeUrl = `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `[TEST] ${b.subject}`,
        html: renderBroadcastHtml({ bodyText: b.body_text, unsubscribeUrl }),
        text: renderBroadcastText({ bodyText: b.body_text, unsubscribeUrl }),
      }),
    });
    if (!res.ok) return json({ error: `resend ${res.status}: ${await res.text()}` }, 502);
    return json({ ok: true, sent_to: to });
  }

  // ── start: flip to sending. The dispatcher does the work. ──
  if (action === "start") {
    const id = typeof body.broadcast_id === "string" ? body.broadcast_id : "";
    if (!id) return json({ error: "broadcast_id is required" }, 400);

    // Only a draft WITH A RESOLVED AUDIENCE may start. Guarding in the WHERE
    // rather than with a read means a double-click cannot start the same
    // broadcast twice, and the audience_resolved_at check means a row whose
    // recipient materialization failed can never be sent as an empty blast.
    const { data: updated, error } = await admin
      .from("broadcasts")
      .update({ status: "sending", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft")
      .not("audience_resolved_at", "is", null)
      .select("id")
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!updated) {
      // Distinguish "no such broadcast" from "wrong state", so the operator is
      // not told a typo'd id is in the wrong status.
      // Checked, for exactly the reason test_send's lookup is checked: a
      // failing read must never render as "not found". An earlier revision of
      // this very block discarded the error and so answered 404 for a
      // broadcast that exists — the same defect, reintroduced by the fix that
      // removed it elsewhere. CLAUDE.md rule 5 applies to diagnostic reads too.
      const { data: exists, error: existsErr } = await admin
        .from("broadcasts")
        .select("status, audience_resolved_at")
        .eq("id", id)
        .maybeSingle();
      if (existsErr) return json({ error: `broadcast lookup failed: ${existsErr.message}` }, 500);
      if (!exists) return json({ error: "broadcast not found" }, 404);
      return json(
        {
          error: exists.audience_resolved_at
            ? `broadcast is ${exists.status}, not draft`
            : "broadcast has no resolved audience — re-create it",
        },
        409,
      );
    }

    return json({ ok: true, broadcast_id: id, status: "sending" });
  }

  // ── retry_failed: failed -> queued, and reopen the parent ──
  if (action === "retry_failed") {
    const id = typeof body.broadcast_id === "string" ? body.broadcast_id : "";
    if (!id) return json({ error: "broadcast_id is required" }, 400);

    const { data: reset, error } = await admin
      .from("broadcast_recipients")
      .update({ status: "queued", error_message: null, updated_at: new Date().toISOString() })
      .eq("broadcast_id", id)
      .eq("status", "failed")
      .select("id");
    if (error) return json({ error: error.message }, 500);

    // Checked, and the response depends on it. This is the worst place in the
    // function to swallow an error: the recipients are already back in
    // 'queued', but if the parent stays 'sent' the dispatcher never selects it
    // again — those people are silently never retried, and the caller was told
    // it worked. A confidently-wrong success. CLAUDE.md rule 5.
    const requeued = reset?.length ?? 0;
    if (requeued > 0) {
      const { error: reopenErr } = await admin
        .from("broadcasts")
        .update({ status: "sending", completed_at: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (reopenErr) {
        return json(
          {
            error: `requeued ${requeued} recipients but could not reopen the broadcast: ${reopenErr.message}. They will NOT be retried until its status is set back to 'sending'.`,
            requeued,
          },
          500,
        );
      }
    }
    return json({ ok: true, requeued });
  }

  return json({ error: `unknown action: ${action}` }, 400);
});
```

- [ ] **Step 3: Write the Lovable prompt**

Create `docs/superpowers/prompts/2026-08-15-broadcast-T4-admin-fn.PASTE.txt` instructing Lovable to create three files:

1. `supabase/functions/_shared/broadcast-render.ts` — a **verbatim copy of the committed `src/lib/broadcast-render.ts`**, read from the repo at prompt-writing time so the two cannot differ, with its header swapped to the mirror-image wording:
   ```
   * KEEP IN SYNC: this is a verbatim copy of `src/lib/broadcast-render.ts`
   * below this header. That copy is canonical and is what
   * src/lib/broadcast-render.test.ts tests.
   ```
2. `supabase/functions/_shared/unsubscribe-token.ts` — exact contents from Task 4 Step 1.
3. `supabase/functions/broadcast-admin/index.ts` — exact contents from Task 4 Step 2.

Then, plus:

```
Do NOT add a config.toml entry for broadcast-admin. It must keep the default
verify_jwt = true — it is called from the browser with the admin's own JWT.

Deploy broadcast-admin and confirm deployed, not just committed.

Then verify authorization actually works, which is the whole point of the
function. Two curl calls, both against the deployed URL:
  1. With a normal org-owner JWT  -> expect 403 Forbidden
  2. With support@tidywisecleaning.com's JWT and body {"action":"create",
     "subject":"t","body_text":"t","message_class":"transactional"}
     -> expect {"total":96,"queued":96,"skipped":0}
Reply with both responses.

Finally, prove the two copies of broadcast-render.ts agree. Run this and paste
the output. It hashes the module body from the first export onward, so the
differing header blocks do not affect it:

  sed -n '/^export const UNSUBSCRIBE_SENTENCE/,$p' \
    supabase/functions/_shared/broadcast-render.ts | shasum -a 256

Expected, exactly:
  425ebfd5e38ca798031b0f2487f36fdc30c681f1bbeaf518c3d0cc557511bfb5

Any other digest means the copy drifted. Do NOT resolve that by editing
src/lib/broadcast-render.ts — that copy is canonical and is what the test
suite pins. Re-copy from it instead.
```

**Why a digest and not `wc -c`:** a byte count the human cannot compare against anything proves nothing, and the two files legitimately differ in total size because their headers differ. The digest is scoped to the shared body and has a stated expected value, so it can actually fail.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/broadcast-admin/index.ts \
        supabase/functions/_shared/unsubscribe-token.ts \
        docs/superpowers/prompts/2026-08-15-broadcast-T4-admin-fn.PASTE.txt
git commit -m "feat: broadcast-admin edge function (create/test/start/retry)"
```

- [ ] **Step 5: Deploy via Lovable, confirm the 403, and turn the sync test green**

The non-admin 403 is the acceptance criterion. If a normal org owner gets anything other than 403, stop and fix before continuing — every other guard in this feature is cosmetic by comparison.

Then close the two-copy loop:

```bash
git fetch origin main
git merge --no-edit origin/main            # brings Lovable's _shared/ copy in
node --experimental-strip-types --test src/lib/broadcast-render.test.ts
```

Expected: **13 of 13 passing.** `the Deno copy behaves identically` going from red to green is the proof the paste landed and that the two copies actually agree. If it fails on a divergence rather than a missing module, Lovable edited the copy — diff it against `src/lib/broadcast-render.ts` and reconcile before continuing.

---

## Task 5: `broadcast-dispatch` worker

**Files:**
- Create: `docs/superpowers/prompts/2026-08-15-broadcast-T5-dispatch.PASTE.txt` — **the only file this task creates.**

Nothing under `supabase/`. The function body and the cron SQL below travel inside the prompt; Lovable creates both. See the Global Constraint on reference `.sql` files.

**Interfaces:**
- Consumes: `broadcast_recipients`, `broadcasts` (Task 2); `renderBroadcastHtml`/`renderBroadcastText` (Task 3); `ensureUnsubscribeToken` (Task 4).
- Produces: nothing other tasks import. Task 8 reads the rows it writes.

Semantics that matter:

- **Claim before send.** Set `sending` before calling Resend. On failure set `failed` and do **not** auto-return to `queued` — Resend may have accepted the message before the response failed, and a duplicate "14 days free" is worse than a missing one. Requeueing is the operator's explicit `retry_failed`. Same reasoning as `notify-new-lead`.
- **Rule 3.** The claim query orders by `id`, a unique tiebreaker.
- 200 ms between sends = 5/s, comfortably under Resend's 10/s per team.

- [ ] **Step 1: Write the worker**

Create `supabase/functions/broadcast-dispatch/index.ts`:

```ts
// Broadcast worker. Cron-driven and resumable: it claims a slice of queued
// recipients, sends each through Resend, and writes the outcome back to the
// same row. Safe to invoke concurrently — the claim is per-row.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import { renderBroadcastHtml, renderBroadcastText } from "../_shared/broadcast-render.ts";
import { ensureUnsubscribeToken } from "../_shared/unsubscribe-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const FROM = "TidyWise <support@tidywisecleaning.com>";
const BATCH = 50;
const SEND_DELAY_MS = 200;   // 5/s — Resend allows 10/s per team
const MAX_ATTEMPTS = 3;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const gate = requireCronSecret(req);
  if (gate) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), { status: 500, headers: corsHeaders });
  }

  const { data: broadcasts } = await supabase
    .from("broadcasts")
    .select("id, subject, body_text, message_class")
    .eq("status", "sending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });   // rule 3: unique tiebreaker

  if (!broadcasts?.length) {
    return new Response(JSON.stringify({ processed: 0, reason: "nothing sending" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;

  for (const b of broadcasts) {
    const { data: batch } = await supabase
      .from("broadcast_recipients")
      .select("id, email, attempts")
      .eq("broadcast_id", b.id)
      .eq("status", "queued")
      .order("id", { ascending: true })     // rule 3
      .limit(BATCH);

    for (const r of batch ?? []) {
      // Claim. The status filter makes a concurrent worker lose the race.
      const { data: claimed } = await supabase
        .from("broadcast_recipients")
        .update({ status: "sending", attempts: r.attempts + 1, updated_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "queued")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      // Never interpolate a null token. `?token=${null}` yields the literal
      // "?token=null" — a dead unsubscribe link on a marketing email, which is
      // the one output this feature must never produce. Fail the recipient
      // instead: they stay visible in the detail table with a reason, and
      // retry_failed can pick them up once the cause is fixed.
      let unsubscribeUrl: string | null = null;
      if (b.message_class === "marketing") {
        const token = await ensureUnsubscribeToken(supabase, r.email);
        if (!token) {
          await supabase
            .from("broadcast_recipients")
            .update({
              status: "failed",
              error_message: "could not mint unsubscribe token — not sending a marketing email without one",
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
          continue;
        }
        unsubscribeUrl = `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`;
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM,
            to: [r.email],
            subject: b.subject,
            html: renderBroadcastHtml({ bodyText: b.body_text, unsubscribeUrl }),
            text: renderBroadcastText({ bodyText: b.body_text, unsubscribeUrl }),
          }),
        });

        if (!res.ok) {
          const detail = (await res.text()).slice(0, 500);
          // NOT returned to 'queued'. Resend may have accepted before the
          // response failed; a duplicate broadcast is worse than a missing
          // one. Requeueing is the operator's explicit retry_failed action.
          await supabase
            .from("broadcast_recipients")
            .update({ status: "failed", error_message: `resend ${res.status}: ${detail}`, updated_at: new Date().toISOString() })
            .eq("id", r.id);
        } else {
          const payload = await res.json().catch(() => ({}));
          await supabase
            .from("broadcast_recipients")
            .update({
              status: "sent",
              provider_message_id: payload?.id ?? null,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
          // Mirror into the unified audit trail. message_id must be unique —
          // email_send_log has a partial unique index on it where status='sent'.
          //
          // Checked but deliberately NON-FATAL, and the asymmetry is the point.
          // The email has already been delivered by this line. Marking the
          // recipient failed because the *audit row* failed would send them a
          // second copy on retry — trading a lost log line for a duplicate
          // email, which is the worse of the two. So: log loudly, leave the
          // recipient 'sent'. Not swallowed (rule 5), just not fatal.
          const { error: logErr } = await supabase.from("email_send_log").insert({
            message_id: `broadcast:${b.id}:${r.id}`,
            template_name: `broadcast:${b.message_class}`,
            recipient_email: r.email,
            status: "sent",
          });
          if (logErr) {
            console.error("[broadcast-dispatch] audit row failed; email WAS sent", {
              broadcast_id: b.id,
              recipient_id: r.id,
              error: logErr.message,
            });
          }
          processed++;
        }
      } catch (err) {
        await supabase
          .from("broadcast_recipients")
          .update({
            status: "failed",
            error_message: String(err instanceof Error ? err.message : err).slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      }

      await new Promise((r2) => setTimeout(r2, SEND_DELAY_MS));
    }

    // Recount and close out. A broadcast is complete when nothing is left
    // queued or sending; it is 'failed' only if every attempt failed.
    const { count: remaining } = await supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", b.id)
      .in("status", ["queued", "sending"]);

    const { count: sent } = await supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", b.id).eq("status", "sent");
    const { count: failed } = await supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", b.id).eq("status", "failed");

    await supabase
      .from("broadcasts")
      .update({
        sent_count: sent ?? 0,
        failed_count: failed ?? 0,
        status: (remaining ?? 0) > 0 ? "sending" : ((sent ?? 0) > 0 ? "sent" : "failed"),
        completed_at: (remaining ?? 0) > 0 ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", b.id);
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

Note on `MAX_ATTEMPTS`: `attempts` is incremented on claim and surfaced in the UI, but the worker does not auto-retry — a `failed` row is only requeued by the operator. The constant is declared for Task 8's UI to warn when a recipient has been retried three or more times.

- [ ] **Step 2: The cron migration (prompt content, not a repo file)**

This SQL goes inside the prompt. Do not create it as a file:

```sql
-- Safety net, not the primary trigger: broadcast-admin's `start` action does
-- not itself send. This picks up anything left in 'sending' — including a
-- broadcast interrupted mid-run — and is a no-op when nothing is sending.
select cron.unschedule('broadcast-dispatch-1min')
where exists (select 1 from cron.job where jobname = 'broadcast-dispatch-1min');

select cron.schedule(
  'broadcast-dispatch-1min',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/broadcast-dispatch',
    -- No Authorization header, deliberately. Verified live 2026-08-15: the
    -- vault contains exactly three secrets — cron_secret, supabase_url and
    -- email_queue_service_role_key. There is NO `service_role_key` and no
    -- `supabase_service_role_key`, so every cron in this repo that names one
    -- is sending `Bearer ` || NULL, i.e. a null header. Those jobs work only
    -- because their functions carry verify_jwt = false and are really gated by
    -- requireCronSecret. Copying that broken Bearer here would be cargo cult;
    -- x-cron-secret is the actual gate. See the config.toml note below.
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
```

- [ ] **Step 3: Write the Lovable prompt and deploy**

Create `docs/superpowers/prompts/2026-08-15-broadcast-T5-dispatch.PASTE.txt` with the function body from Step 1, the migration from Step 2, and:

```
ADD this config.toml entry for broadcast-dispatch:

  [functions.broadcast-dispatch]
    verify_jwt = false

This reverses an earlier instruction, on evidence. pg_cron cannot present a
user JWT, and this project's vault has no service-role secret to forge one
with — it holds exactly cron_secret, supabase_url and
email_queue_service_role_key, verified 2026-08-15. Leaving verify_jwt = true
would mean the gateway rejects every cron invocation with 401 and the worker
never sends, with the broadcast sitting at 'sending' and no error surfaced.

Authorization is NOT weakened by this: requireCronSecret gates the function
internally on x-cron-secret, which is exactly what CLAUDE.md rule 2 requires
of a verify_jwt = false function, and is the same arrangement the working
cron functions use (process-review-sms-queue and weekly-business-report both
carry verify_jwt = false).

Do NOT add an entry for broadcast-admin. That one is called from the browser
with the admin's own JWT, so the default verify_jwt = true is correct there.

Deploy broadcast-dispatch, run the cron migration, and confirm deployed.
Reply with: SELECT jobname, schedule, active FROM cron.job
            WHERE jobname = 'broadcast-dispatch-1min';
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/prompts/2026-08-15-broadcast-T5-dispatch.PASTE.txt
git commit -m "feat: broadcast-dispatch worker + 1-minute cron safety net (Lovable prompt)"
```

- [ ] **Step 5: End-to-end smoke test with an audience of one**

Before pointing this at 96 people, prove the loop with an audience of one. This block goes into the prompt as its final section, so Lovable deploys and proves it in a single round trip.

It is deliberately **one self-contained statement with no `:placeholders`** — the earlier draft used psql-style `:bid` variables, which cannot run in a chat interface and would have failed on paste. Precondition verified live 2026-08-15: `support@tidywisecleaning.com` exists and owns the `TIDYWISE` organization, so the join resolves.

```sql
-- One broadcast whose entire audience is the platform admin.
-- status starts at 'sending' so the 1-minute cron picks it up without a
-- second statement; audience_resolved_at is set because the start action's
-- guard requires it and a smoke test should not create a row that guard
-- would refuse.
with admin_org as (
  select u.id as user_id, o.id as org_id, lower(u.email) as email
  from auth.users u
  join public.organizations o on o.owner_id = u.id
  where lower(u.email) = 'support@tidywisecleaning.com'
  limit 1
),
new_broadcast as (
  insert into public.broadcasts
    (subject, body_text, message_class, created_by, status,
     recipient_count, audience_resolved_at, started_at)
  select 'Broadcast smoke test',
         'If you are reading this, the broadcast worker sends. Nothing to do.',
         'transactional', a.user_id, 'sending', 1, now(), now()
  from admin_org a
  returning id
)
insert into public.broadcast_recipients
  (broadcast_id, organization_id, user_id, email)
select nb.id, a.org_id, a.user_id, a.email
from new_broadcast nb cross join admin_org a
returning broadcast_id, email;
```

Wait 60 seconds, then run and paste back:

```sql
select b.status as broadcast_status, b.sent_count, b.completed_at,
       r.status as recipient_status, r.provider_message_id, r.error_message
from public.broadcasts b
join public.broadcast_recipients r on r.broadcast_id = b.id
where b.subject = 'Broadcast smoke test'
order by b.created_at desc limit 1;
```

Expected: the email arrives from `support@tidywisecleaning.com`; `recipient_status = 'sent'` with a **non-null** `provider_message_id`; `broadcast_status = 'sent'`, `sent_count = 1`, `completed_at` set. A null `provider_message_id` on a `sent` row means the Resend response was not parsed — treat that as a failure even though the email arrived.

---

## Task 6: Audience contract test

Guards the one thing that would be invisible if wrong: that the audience is 96 and comes from `owner_id`, not membership.

**Files:**
- Create: `tests/broadcast-audience.contract.spec.ts`
- Modify: `.env.test.example` — add the two new credential pairs with the same explanatory style as the existing three.
- Modify: `tests/README.md` — document that this spec needs them.

**Credential requirement, and it is specific:** `PLATFORM_ADMIN_EMAIL` must be **`support@tidywisecleaning.com`**. `is_platform_admin()` allows two addresses, but the `platform-analytics` edge function this test uses as its oracle gates on that one address only (`platform-analytics/index.ts:10,74`). The other platform admin would get a 403 from the oracle and the test would fail for a reason unrelated to the audience.

`QA_ORG_OWNER_*` is deliberately a **new** pair rather than a reuse of `QA_OWNER_*`. Test 3 asserts a non-platform-admin sees zero rows, which is only meaningful if that account is genuinely not a platform admin — a fact nothing in the repo asserts about `QA_OWNER`. Reusing it would make this test's meaning depend on an undocumented property of an account that could change during any credential rotation. Note this is *not* the duplication `.env.test.example`'s header warns about: that warning is about copying one secret **value** into many files, whereas this is one distinct identity for one distinct role, single-sourced.

- [ ] **Step 1: Write the test**

```ts
// Contract test: the broadcast audience must come from organizations.owner_id.
//
// The bug this exists to prevent: resolving via org_memberships.role='owner'
// returns 93, not 96. Three orgs hold their owner as role='member', so a
// membership-based query silently drops them — verified live 2026-08-15.
//
// Requires SUPABASE_URL + a platform-admin session; see tests/README.md.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;

test('transactional audience is every org owner', async () => {
  const supabase = createClient(url, anon);
  await supabase.auth.signInWithPassword({
    email: process.env.PLATFORM_ADMIN_EMAIL!,
    password: process.env.PLATFORM_ADMIN_PASSWORD!,
  });

  const { data, error } = await supabase.rpc('broadcast_audience', {
    p_message_class: 'transactional',
  });
  expect(error).toBeNull();

  // The oracle CANNOT be a direct read of `organizations`. Its only SELECT
  // policy is `owner_id = auth.uid() OR is_org_member(id)` — there is no
  // platform-admin bypass. Verified against pg_policies 2026-08-16: a
  // client-side count as the platform admin returns 1, their own org, while
  // the real total that day was 97. Asserting audience === that count fails
  // permanently and proves nothing. This RLS ceiling is the entire reason
  // broadcast_audience is SECURITY DEFINER.
  //
  // platform-analytics is service-role backed and platform-admin gated, and
  // is where the app's own dashboard reads this number
  // (src/pages/admin/PlatformAnalyticsPage.tsx).
  const { data: analytics, error: analyticsError } =
    await supabase.functions.invoke('platform-analytics');
  expect(analyticsError).toBeNull();

  const orgCount = analytics?.organizations?.total;
  // Guard the oracle itself. If it came back undefined or 0 — a failed
  // invoke, a changed response shape — then `toBe(orgCount)` below would
  // either throw confusingly or pass vacuously against an empty audience.
  expect(typeof orgCount).toBe('number');
  expect(orgCount).toBeGreaterThan(0);

  expect(data!.length).toBe(orgCount);
  expect(data!.every((r: { eligible: boolean }) => r.eligible)).toBe(true);

  const emails = data!.map((r: { email: string }) => r.email);
  expect(new Set(emails).size).toBe(emails.length);   // no duplicate recipients
});

test('marketing audience marks opted-out owners skipped rather than dropping them', async () => {
  const supabase = createClient(url, anon);
  await supabase.auth.signInWithPassword({
    email: process.env.PLATFORM_ADMIN_EMAIL!,
    password: process.env.PLATFORM_ADMIN_PASSWORD!,
  });

  const { data: tx } = await supabase.rpc('broadcast_audience', { p_message_class: 'transactional' });
  const { data: mk } = await supabase.rpc('broadcast_audience', { p_message_class: 'marketing' });

  // Same row count — "who didn't get it" must remain answerable.
  expect(mk!.length).toBe(tx!.length);

  const skipped = mk!.filter((r: { eligible: boolean }) => !r.eligible);
  expect(skipped.length).toBeGreaterThan(0);
  for (const s of skipped) {
    expect(['unsubscribed', 'suppressed']).toContain(s.skip_reason);
  }
});

test('a non-platform-admin gets no audience at all', async () => {
  const supabase = createClient(url, anon);
  await supabase.auth.signInWithPassword({
    email: process.env.QA_ORG_OWNER_EMAIL!,
    password: process.env.QA_ORG_OWNER_PASSWORD!,
  });
  const { data } = await supabase.rpc('broadcast_audience', { p_message_class: 'transactional' });
  expect(data ?? []).toHaveLength(0);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test -c playwright.qa.config.ts broadcast-audience`
Expected: 3 passed. The third test is the important one — it proves the `is_platform_admin()` guard inside the SECURITY DEFINER function actually fires.

- [ ] **Step 3: Commit**

```bash
git add tests/broadcast-audience.contract.spec.ts
git commit -m "test: broadcast audience contract — owner_id not membership"
```

---

## Task 7: Compose page

**Files:**
- Create: `src/pages/admin/BroadcastPage.tsx`
- Create: `src/hooks/useBroadcasts.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `broadcast-admin` actions `create`, `test_send`, `start`.
- Produces: route `/dashboard/broadcasts`.

UI requirements, all non-negotiable:
- `message_class` is a radio group with **nothing preselected**. The send button stays disabled until one is chosen.
- Choosing `marketing` shows the live recipient split ("95 of 96 — 1 unsubscribed") and a note that an unsubscribe link is appended automatically.
- Preview renders through the same `renderBroadcastHtml` the worker uses.
- Test-send to self is required before the real send button enables.
- Confirmation dialog requires typing the exact recipient count.

- [ ] **Step 1: Write the hooks**

Create `src/hooks/useBroadcasts.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MessageClass = 'transactional' | 'marketing';

export interface BroadcastRow {
  id: string;
  subject: string;
  message_class: MessageClass;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
}

// Plain arrays and objects only — never a Map or Set. The query cache is
// persisted to localStorage via JSON.stringify, which flattens both to {}
// and throws on the next .get() (CLAUDE.md rule 1).
export function useBroadcasts() {
  return useQuery({
    queryKey: ['broadcasts'],
    queryFn: async (): Promise<BroadcastRow[]> => {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('id, subject, message_class, status, recipient_count, sent_count, failed_count, skipped_count, created_at, completed_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });   // rule 3: unique tiebreaker
      if (error) throw error;
      return data ?? [];
    },
  });
}

// `if (error) throw error` would discard everything the function said.
// supabase-js collapses every non-2xx into a FunctionsHttpError whose message
// is the generic "Edge Function returned a non-2xx status code", and sets
// `data` to null — so a `data?.error` branch after it is unreachable dead
// code. That exact shape once made PublicBookingPage's double-booking branch
// impossible to fire; `src/lib/edgeFunctionError.ts` exists because of it.
//
// It matters more here than in most places. The messages being thrown away
// include "audience resolved to 0 recipients — refusing to create an empty
// broadcast" and "broadcast is sending, not draft" — precisely what an
// operator needs to read in a tool with no unsend.
async function callAdmin(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('broadcast-admin', { body: payload });
  if (error) {
    throw new Error(
      await readEdgeFunctionError(error, `Broadcast ${payload.action ?? 'request'} failed`),
    );
  }
  return data;
}

export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { subject: string; body_text: string; message_class: MessageClass }) =>
      callAdmin({ action: 'create', ...v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useTestSend() {
  return useMutation({
    mutationFn: (broadcast_id: string) => callAdmin({ action: 'test_send', broadcast_id }),
  });
}

export function useStartBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (broadcast_id: string) => callAdmin({ action: 'start', broadcast_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useRetryFailed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (broadcast_id: string) => callAdmin({ action: 'retry_failed', broadcast_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}
```

- [ ] **Step 2: Build the compose page**

Create `src/pages/admin/BroadcastPage.tsx` with this structure (using the repo's existing shadcn primitives — `Card`, `Input`, `Textarea`, `RadioGroup`, `Button`, `AlertDialog`, `useToast`):

1. **Compose card** — `Input` for subject (maxLength 200, live counter), `Textarea` for body.
2. **Class card** — `RadioGroup` with `value={messageClass ?? undefined}` so nothing is selected initially. Two options with helper text: *Transactional — a service notice. Reaches all owners, including those who opted out.* / *Marketing — promotional. Skips opted-out owners and appends an unsubscribe link.*
3. **Draft + preview** — "Save draft & resolve audience" calls `useCreateBroadcast`, then shows `total / queued / skipped` from the response and an iframe-free preview via `renderBroadcastHtml`.
4. **Test send** — button calls `useTestSend`. On success record **which draft was tested**, not a bare boolean: `setTestedDraftId(draftId)`. The send gate is then `testedDraftId === draftId`, not `hasTested`.

   A page-level boolean races across drafts, and the reset action in item 7 makes that reachable by ordinary use: create draft A → click test-send → while it is in flight, hit Start over → compose and create draft B → A's `onSuccess` lands and flips the flag → B is now sendable having never been tested. Slow network plus a change of mind is not an exotic input. Scoping the flag to the draft id makes the stale resolution a no-op instead of a false green light.
5. **Send** — disabled unless `messageClass !== null && draftId && hasTested`. Opens an `AlertDialog` whose confirm button is disabled until the typed value equals `String(queuedCount)`. On confirm, `useStartBroadcast`, then navigate to the detail page.
6. **History** — table from `useBroadcasts`, each row linking to `/dashboard/broadcasts/:id`.

- [ ] **Step 3: Wire the routes**

Modify `src/App.tsx` — add alongside the other lazy imports:

```tsx
const BroadcastPage = lazy(() => import("./pages/admin/BroadcastPage"));
const BroadcastDetailPage = lazy(() => import("./pages/admin/BroadcastDetailPage"));
```

and next to the existing `/dashboard/platform-revenue` route (which already uses `PlatformAdminRoute`):

```tsx
<Route path="/dashboard/broadcasts" element={<PlatformAdminRoute><ErrorBoundary featureName="Broadcasts"><BroadcastPage /></ErrorBoundary></PlatformAdminRoute>} />
<Route path="/dashboard/broadcasts/:id" element={<PlatformAdminRoute><ErrorBoundary featureName="Broadcast Detail"><BroadcastDetailPage /></ErrorBoundary></PlatformAdminRoute>} />
```

Note: `/dashboard/platform-analytics` is registered twice in `App.tsx` (lines 378 and 524) and uses plain `AdminRoute`. Do not copy that pattern — register these once each, under `PlatformAdminRoute`.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
git add src/pages/admin/BroadcastPage.tsx src/hooks/useBroadcasts.ts src/App.tsx
git commit -m "feat: broadcast compose page under PlatformAdminRoute"
```

---

## Task 8: Detail page — did it finish, who missed it, retry

**Files:**
- Create: `src/pages/admin/BroadcastDetailPage.tsx`

**Interfaces:**
- Consumes: `useBroadcasts`, `useRetryFailed` (Task 7); `broadcast_recipients` via RLS SELECT (Task 2).

- [ ] **Step 1: Add the recipients hook**

Append to `src/hooks/useBroadcasts.ts`:

```ts
export interface RecipientRow {
  id: string;
  email: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
  skip_reason: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  // Needed by item 6's stuck-in-'sending' detection: a row is stale when its
  // status is 'sending' and updated_at is older than 10 minutes. sent_at is
  // null on those rows by definition, so it cannot serve as the clock.
  updated_at: string;
}

export function useBroadcastRecipients(broadcastId: string | undefined) {
  return useQuery({
    queryKey: ['broadcast-recipients', broadcastId],
    enabled: !!broadcastId,
    // Poll while the send is in flight; 96 recipients finish in well under a
    // minute, so a 5s tick is enough to watch it complete.
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as RecipientRow[];
      return rows.some((r) => r.status === 'queued' || r.status === 'sending') ? 5000 : false;
    },
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data, error } = await supabase
        .from('broadcast_recipients')
        .select('id, email, status, skip_reason, error_message, attempts, sent_at, updated_at')
        .eq('broadcast_id', broadcastId!)
        .order('status', { ascending: true })
        .order('id', { ascending: true });   // rule 3
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

- [ ] **Step 2: Build the page**

Create `src/pages/admin/BroadcastDetailPage.tsx`:

1. **Header** — subject, class badge, status badge, `started_at` → `completed_at`.
2. **Four counters** — Sent / Failed / Skipped / Remaining, computed from the recipient rows so they never disagree with the detail table.
3. **"Did it finish?"** — an explicit line: *Complete — 96 of 96 sent* or *In progress — 41 sent, 55 remaining*, driven by whether any row is `queued`/`sending`.
4. **Recipient table** — email, status badge, `skip_reason` or truncated `error_message`, `attempts`, `sent_at`. Default filter to non-`sent` so "who didn't get it" is the first thing on screen; a toggle shows all.
5. **Retry failed** — visible only when `failed_count > 0`, calls `useRetryFailed`, confirms with the count, then relies on the 1-minute cron to pick the requeued rows back up.

6. **Never offer to start a draft from this page.** Task 7's compose flow can leave **orphaned drafts**: its "Start over" action resets local state only, so a `broadcasts` row already created — `status='draft'`, `audience_resolved_at` set, ~97 `broadcast_recipients` rows materialised — persists forever, and `broadcast-admin` has no delete or cancel action. Those rows appear in the History table indistinguishable from a live draft except by status.

   They also satisfy `start`'s guard exactly (`status='draft' AND audience_resolved_at IS NOT NULL`). So a "resume" or "send this one" control on a history row would let an abandoned draft — one nobody previewed, test-sent, or confirmed — go to every organization owner. Do not add one. Render `draft` rows read-only, and label them so an abandoned draft is visibly distinct from one in progress.

7. **Stuck-in-sending warning.** A recipient claimed as `sending` whose function then died — redeploy, timeout, or a failed status write after Resend already accepted — is unreachable by every existing path: the worker selects only `queued`, and `retry_failed` selects only `failed`. The broadcast then never completes, because `remaining` counts `sending`, and the cron re-runs its count queries every minute forever. Surface any `sending` row older than **10 minutes** as a warning banner naming the count, with this SQL shown for the operator to run in Lovable:

```sql
-- Inspect first. A 'sending' row MAY already have been delivered — that is
-- exactly why the worker refuses to requeue it automatically.
select id, email, attempts, updated_at
from public.broadcast_recipients
where broadcast_id = '<id>' and status = 'sending'
  and updated_at < now() - interval '10 minutes';

-- Then mark them abandoned, NOT queued. 'failed' makes them visible and
-- reachable by Retry failed, which puts the resend decision in a human's
-- hands. Flipping them straight to 'queued' would re-send to someone who may
-- already have the email — the duplicate this whole design avoids.
update public.broadcast_recipients
set status = 'failed',
    error_message = 'abandoned in sending — worker died mid-send, resend manually if needed',
    updated_at = now()
where broadcast_id = '<id>' and status = 'sending'
  and updated_at < now() - interval '10 minutes';
```

Do **not** add an automatic sweeper. The direction of this gap is correct — a stuck row is safer than a duplicate — and the fix is to make it visible and operator-resolvable, not to close it automatically.

- [ ] **Step 3: Typecheck, lint, commit**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
git add src/pages/admin/BroadcastDetailPage.tsx src/hooks/useBroadcasts.ts
git commit -m "feat: broadcast detail page with per-recipient status and retry"
```

---

## Task 9: Full-path verification

- [ ] **Step 1: Run the full QA suite**

```bash
node --experimental-strip-types --test src/lib/broadcast-render.test.ts   # expect 13/13
npm run test:qa
npx playwright test -c playwright.qa.config.ts --project=unit
```

Expected: 13/13 on the render suite — including `the Deno copy behaves identically`, which must be green by now — and no new failures elsewhere relative to the pre-change baseline. A skipped or deleted sync test counts as a failure of this step.

- [ ] **Step 2: Non-admin cannot reach the page or the function**

Log in as an ordinary org owner. Navigate to `/dashboard/broadcasts` — expect a redirect to `/dashboard` and a `[SECURITY]` console line. Then call `broadcast-admin` directly with that user's token — expect **403**. The second check is the one that matters; the first is convenience.

- [ ] **Step 3: Transactional dry run to a real audience of 96**

Compose a short transactional notice. Confirm the draft response reports `total: 96, queued: 96, skipped: 0`. Test-send to self, check rendering has **no** unsubscribe footer. Send. Watch the detail page reach 96/96.

- [ ] **Step 4: Marketing run**

Compose a marketing message. Confirm `total: 96, queued: 95, skipped: 1` with `skip_reason = 'unsubscribed'`. Test-send to self and confirm the unsubscribe footer **is** present and the link resolves to `handle-email-unsubscribe`. Send, and confirm the detail page shows 95 sent and 1 skipped — the skipped row visible, not absent.

- [ ] **Step 5: Retry path**

Ask Lovable to flip one `sent` row to `failed` with a fake `error_message`. Confirm the detail page surfaces it, click Retry failed, and confirm it returns to `queued` and is re-sent within a minute.

- [ ] **Step 6: Update CLAUDE.md**

Add to the Layout/feature notes: broadcasts are platform-admin only, audience is `organizations.owner_id`, and `org_memberships` is **not** a valid audience source (93 vs 96). Commit.

---

## Self-review

**Spec coverage.** Compose page under `PlatformAdminRoute` → Task 7. Server-side `is_platform_admin()` via user-scoped client → Task 4 Step 2, tested in Task 6 Step 1 (third test) and Task 9 Step 2. `message_class` required, no default → DB constraint (Task 2), validator (Task 3), UI radio with nothing preselected (Task 7). Transactional reaches 96 / marketing skips 1 → `broadcast_audience` (Task 2), verified Task 9 Steps 3–4. Unsubscribe appended at send time → Task 3, unit-tested, applied in Tasks 4 and 5. Broadcast record answering finish/who-missed/retry → Task 2 schema, Task 5 counters, Task 8 UI. Preview + test-send + confirmation → Task 7 Step 2. `rate_limited` fix → Task 1. Provider decision → stated up front.

**Placeholder scan.** No TBDs. Task 7 Step 2 and Task 8 Step 2 describe component structure rather than full JSX — deliberate, because the repo has established shadcn patterns to follow and the behavioural requirements (nothing preselected, send disabled until tested, typed-count confirmation, default filter to non-sent) are stated as testable specifics.

**Type consistency.** `MessageClass` is `'transactional' | 'marketing'` in `broadcast-render.ts`, `useBroadcasts.ts`, and the DB CHECK. `renderBroadcastHtml`/`renderBroadcastText` take `{bodyText, unsubscribeUrl}` in Tasks 3, 4 and 5. `ensureUnsubscribeToken(supabase, email)` matches between Tasks 4 and 5. `broadcast_audience(p_message_class)` returns the same five columns everywhere it is consumed. Recipient statuses are `queued|sending|sent|failed|skipped` in the CHECK, the worker, and `RecipientRow`.

## Open items

- **`suppressed_emails` is empty while one profile is unsubscribed.** The resolver checks both, so the broadcast is correct either way — but the two stores disagreeing is a real bug in `handle-email-unsubscribe`'s write path, and worth its own ticket.
- **3 orgs whose owner sits as `role='member'`** fail `is_org_admin()` for their own org. Not a broadcast problem, since the audience bypasses membership entirely, but it means those owners have degraded rights in the app.
- **`run-winback-drip` is dead code** — it filters `organizations.is_active`, a column that does not exist, and swallows the `42703`. Separate ticket.
- **`emailEligibility.ts` should fold onto `_shared/unsubscribe-token.ts`** so the two minting paths cannot drift.
