# Editable Automation Messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every automated message a business sends is editable by that business, without letting them delete the things that keep them legal.

**Architecture:** Adopt the orphaned `automation_definitions` / `automation_triggers` / `automation_steps` schema rather than building a new one. Senders gain a shared template-resolution helper that reads the org's row and **falls back to today's hardcoded string when there isn't one**, so the existing copy becomes the default rather than dead code. A `message_class` column drives STOP enforcement at send time; a per-key token vocabulary drives validation at save time. Senders migrate one at a time.

**Tech Stack:** Postgres (Supabase, Lovable-managed) · Deno edge functions · existing `AutomationEditorDialog` (429 lines, already built)

**Background:** `docs/investigations/2026-07-30-automation-message-copy.md` — read it first; every claim below traces to it.

## Global Constraints

- **Fail safe, not blank.** A missing, empty or unparseable template falls back to the current hardcoded string. No message is ever skipped or sent empty because a template is bad.
- **The STOP line is enforced by code, never by copy.** Appended at send time for `marketing`-class messages, whatever the template says.
- **Transactional messages must NOT get a STOP line.** It is wrong on an appointment reminder and would be a new bug, not a fix.
- **Tracked links stay tokens.** `{booking_link}` and the pilot's quote link carry per-recipient attribution; a pasted raw URL silently breaks it.
- **Unknown tokens are an error at save time**, not braces shipped to a customer.
- `supabase/` is Lovable's — schema and edge-function changes ship as paste-ready prompts ending in "confirm deployed, not just committed."
- Rule 4b: confirm `automation_steps` matches `20260707060120` **live** before building on it.

---

## 1. The order — confirmed, with one insertion and one revision

Your recalled order was right. Two changes now that I am planning rather than sketching.

**Confirmed as-is:**
- **STOP compliance first.** It is a live hole on the one system that already has editable copy (`CampaignEditDialog.tsx:110-119` is a bare textarea; an owner can delete the STOP line and save). It is `src/`-only, needs no Lovable, and is independent of everything else.
- **Message class second.** The STOP rule is per-class and nothing records the class today.
- **`quote_stale_reengage` as the pilot.** Still the right choice, and for better reasons than "smallest": it is SMS-only, single-step, single-recipient, already has dedupe via `automation_fire_log`, and is low-volume. It also already queries `organization_automations` by its own `automation_type` (`:40-43`), which is exactly the key the template lookup needs.

> **Status 2026-07-30:** task 1 is **shipped**. Task 0 is **queued** as
> `docs/superpowers/prompts/2026-07-30-audit-automation-steps-rows.md`. Everything from
> task 2 onward is unstarted and gated on task 0.
>
> Task 1 turned out to be three call sites, not one — see the foot of this document.

### INSERTED — a new step 0, before anything else

**Check whether any org already has rows in `automation_steps`.**

The editor has been live and writing since migration `20260707060120`. Every owner who used it got "Automation saved" and reasonably assumed their copy was live. **The moment a sender starts reading that table, all of that copy ships — untested, unreviewed, possibly written years ago as an experiment, possibly rude.**

That is a real hazard and it is invisible until it happens. It has to be looked at before Task 3, not discovered by a customer.

```sql
select d.automation_key, count(distinct d.organization_id) as orgs,
       count(s.id) as steps,
       min(s.created_at) as first_edit, max(s.updated_at) as last_edit
from public.automation_definitions d
left join public.automation_steps s on s.automation_id = d.id
group by d.automation_key order by steps desc;

-- The actual copy, so it can be eyeballed before it is ever sent
select o.name, d.automation_key, s.channel, s.position,
       left(s.sms_body, 200) as sms, left(s.email_subject, 120) as subject
from public.automation_steps s
join public.automation_definitions d on d.id = s.automation_id
join public.organizations o on o.id = s.organization_id
order by o.name, d.automation_key, s.position;
```

If rows exist, the migration needs an explicit activation step per org rather than silently going live.

### REVISED — tokens cannot be entirely last

"Unify tokens last" is right. "Build no token work until last" is not: the pilot needs a resolver on day one. The revision:

- **Build one new resolver now**, used only by migrated senders.
- **Leave the three legacy engines untouched** (`process-campaign-queue`, `send-review-request-sms`, `followup-abandoned-booking`). Changing them mid-migration risks existing owner copy.
- **Unify only after several senders are migrated**, when the new resolver has proven its vocabulary.

So the order becomes: **0 audit → 1 STOP → 2 class + resolver → 3 pilot → 4 per-sender → 5 unify legacy.**

## 2. Is `automation_steps` the destination? Yes — and the join is free

**Use it. Starting over would mean rebuilding a working editor for no gain.**

The decisive fact, which I verified rather than assumed: `AutomationsTab.tsx:681` and `:743` do

```ts
setEditing({ key: auto.automation_type, name: formatName(auto.automation_type) })
```

and the dialog writes that straight into `automation_definitions.automation_key`, which carries `UNIQUE (organization_id, automation_key)`.

**So `automation_key` *is* `organization_automations.automation_type`.** Every sender already knows its own `automation_type` and already queries that table by it. The template lookup is a join on a key the sender is holding — no mapping table, no translation layer, no renaming.

The schema also models what the senders need, which `organization_automations.settings` cannot:

| Need | `automation_steps` |
|---|---|
| SMS and email copy | `sms_body`, `email_subject`, `email_body`, `channel ∈ (sms, email, both)` |
| Multiple messages per automation | `position`, plus the `automation_id` FK — winback's 3 drips fit naturally |
| Who receives it | `recipient_client`, `recipient_cleaner`, `recipient_owner` |
| When | `offset_value`/`offset_unit`/`direction`, plus a **generated** `offset_minutes` |
| Safety | RLS on all three tables, and a conflict trigger blocking duplicate (org, trigger, channel, recipient, offset) |

**What it lacks — and this is the whole of Task 2:**

1. **`message_class`.** No column. The STOP rule cannot be enforced without it.
2. **No notion of "default vs overridden".** A sender finding no row must fall back to its hardcoded string. That is a code convention, not a schema gap, but it must be decided now: **the hardcoded copy becomes the seeded default, not dead code.** It is what makes every failure mode safe.

**One caveat worth stating:** `automation_steps` was designed for a step-sequence engine that does not exist. Migrated senders will use one row of it and ignore `offset_*`/`position`, because their timing is already in their cron. That is fine — the fields are simply unused for those senders — but do not let it drift into someone building a second scheduler.

## 3. `quote_stale_reengage`, end to end

**Where the copy lives today** — `quote-stale-reengage/index.ts:116`:

```ts
const message = `Hi ${customerName} — just checking in on your ${serviceName} quote from ${companyName}. Still interested? View it here: ${quoteLink}. Reply if you have questions!`;
```

Four interpolations: `customerName` (`first_name ?? "there"`), `serviceName` (`?? "cleaning service"`), `companyName` (from `business_settings`), `quoteLink` (`${QUOTE_LINK_BASE}/${quote.id}`).

**Note it carries no STOP line today.** Migrating it forces the class decision immediately — which is a feature of picking it as the pilot, not a problem. My read: a nudge about a quote *they requested* is transactional-adjacent, but it is unsolicited follow-up, so **`marketing`** is the defensible classification, and migrating it would *add* a STOP line it currently lacks. That is a compliance improvement, and it should be a conscious decision rather than a side effect.

**After migration, the path:**

1. **Owner edits.** Automations tab → pencil on "Quote Stale Reengage" → the existing dialog. Writes `automation_steps.sms_body` for `automation_key = 'quote_stale_reengage'`.
2. **Save-time validation.** Tokens checked against this key's declared vocabulary (`{customer_name}`, `{service_name}`, `{company_name}`, `{quote_link}`). Unknown token → save blocked with the offending token named. Missing `{quote_link}` → blocked, since the message has no purpose without it.
3. **Send time.** The sender already loops enabled orgs. It gains one lookup:
   ```
   automation_definitions (org, key='quote_stale_reengage')
     → automation_steps (channel in ('sms','both'), recipient_client, lowest position)
   ```
4. **Resolve.** Template + a data map built from what the sender already has. One resolver, one syntax.
5. **Enforce.** `message_class = 'marketing'` → append the STOP line if not already present. Code, not copy.
6. **Send** via `send-openphone-sms` exactly as now. Log to `automation_fire_log` as now, plus which template was used.

**What happens when the template is blank or broken — all five cases fall back, none fail:**

| Case | Behaviour |
|---|---|
| No `automation_definitions` row | hardcoded default; send normally |
| Row exists, `sms_body` empty | hardcoded default |
| Whitespace only | treated as empty → default |
| Contains an unknown token (pre-validation legacy row) | **strip the braces**, send the rest, log a warning |
| Missing `{quote_link}` | **use the default instead** — a re-engagement with no link is worse than the stock wording |

Never send blank, never skip the customer, never ship literal `{braces}`. The last one is defence in depth: save-time validation should prevent it, but rows written before validation existed will not have been checked.

## 4. Tokens

**Unifying is a per-sender migration, not one change.** Each engine substitutes a different vocabulary from a different data set, and the three legacy engines have live owner-authored copy behind them. A single global rename would silently change what existing campaigns send. So: new resolver for migrated senders, legacy engines frozen, unify last.

**Syntax:** pick **`{single}`** for the new resolver. It is what all three SMS engines already use and what owners have already typed; `{{double}}` is confined to email, where `org-email-renderer` can keep it until the unify step.

**Unknown token at save time: error, and here is why the alternative is worse.** Silently shipping braces means a paying customer receives *"Hi {firstname}"* from a business that has no idea, because nothing tells them. There is no feedback loop at all — the owner sees their template, not the output. At save time the owner is present, the fix is obvious, and the cost is ten seconds.

Two things that makes necessary:

- **Vocabulary must be declared per `automation_key`**, because it genuinely differs — `{cleaner_name}` is meaningful in a review request and meaningless in a quote nudge. A shared list would either be too permissive or block valid tokens.
- **The editor must show the valid list for the message being edited.** `AutomationEditorDialog:299` currently advertises one hardcoded list including `{{booking_date}}`, which exists in no engine at all. That is worse than no help.

**Also fix while in there:** the three disagreeing empty-name fallbacks — `''` in campaigns (yielding "Hi !"), `'there'` in abandoned-booking, `'there'` in this pilot. Pick one, put it in the resolver.

## 5. What owners cannot have

State these in the UI, do not silently ignore edits:

| Not editable | Why |
|---|---|
| **Auth emails** (`_shared/email-templates/*.tsx`) | password reset and magic links — an editable one is a phishing vector |
| **The CAN-SPAM footer** (`_shared/email-footer.ts`) | legally required, correctly centralised |
| **The STOP line on marketing SMS** | TCPA. Editable *around*, never removable |
| **Unsubscribe links** | must stay system-generated (`handle-email-unsubscribe`) |
| **Tracked link targets** | `{booking_link}` carries a per-recipient ref (`process-campaign-queue:914-915`); the pilot's quote link is the same shape. The token is editable in *placement*, never replaceable with a pasted URL |

**Separate bug, found in the investigation and worth its own ticket:** `email-footer.ts:13` hardcodes **TidyWise's** postal address and `:16` a TidyWise unsubscribe mailto. Correct for platform mail; **wrong for an org's marketing email**, where CAN-SPAM requires that org's physical address. Not part of this work, but it is a compliance gap on the same surface.

---

## What it costs

Honest sizing. "Session" = a focused block, not a day.

| Task | Where | Size | Blocked by |
|---|---|---|---|
| **0. Audit `automation_steps`** | Lovable query | minutes | nothing — do it first — **QUEUED** |
| **1. STOP validation** | `src/` only | one session | **DONE 2026-07-30** |
| **2. `message_class` + resolver + per-key vocabulary** | 1 migration + 1 shared module | one session | task 0 |
| **3. Pilot `quote_stale_reengage`** | 1 edge function + seed | one session | task 2 |
| **4. Each further sender** | 1 edge function each | ~half a session each | task 3 proving out |
| **5. Unify legacy token engines** | 3 edge functions + data check | one session, higher risk | several of task 4 |

**Task 4 is the real cost: roughly 12 senders.** Reminder is the worst (N intervals × client/cleaner variants); winback needs 3 rows; review requests need **three** senders reconciled onto one template, one of which currently ignores the editable column that already exists.

**The cheap, high-value stopping points**, if you want value without committing to all of it:

- **Task 1 alone** closes a live compliance hole. Independent, `src/`-only, worth doing regardless of whether the rest ever happens.
- **Through task 3** proves the whole design on one message and leaves eleven senders working exactly as they do now. That is the natural place to reassess.
- **`review_request` as the second migration rather than by size** — it is the one where an owner already edits copy that the automation ignores (`process-review-sms-queue:179` hardcodes while `business_settings.review_sms_template` sits there being honoured only by the manual button). Fixing it converts an actively misleading feature, not just a static one.

## Self-review

- **Your five questions answered:** order confirmed with an inserted audit step and a token revision (§1); `automation_steps` confirmed as destination with the key-alignment proof (§2); the pilot traced end to end including all five failure modes (§3); tokens as per-sender migration with save-time errors and the reasoning (§4); the not-editable list with the footer bug flagged separately (§5).
- **The insertion is the part I would defend hardest.** Senders reading a table that has been silently accepting edits is how you ship an owner's abandoned draft to their customers. It costs minutes to check and is unrecoverable if missed.
- **Not designed:** the editor UI changes for per-key vocabularies, and whether `message_class` is seeded per `automation_key` or chosen by the owner. The latter needs a product view — I would seed it and not let owners change it, since reclassifying a marketing message as transactional is exactly how the STOP line gets removed legitimately-looking.


---

## Task 1 as built — 2026-07-30

**Scoped as "validation in `CampaignEditDialog`". It was three write paths, not one**,
and closing only the edit dialog would not have closed the hole:

1. **`CampaignEditDialog`** — editing an existing campaign, the path the investigation named
2. **`CampaignWizard` create** — the seeded default is a plain textarea and can be deleted before first save
3. **`CampaignWizard` AI templates** — `handleUseTemplate` overwrote `smsBody` wholesale with model output

`src/components/admin/campaigns/stopCompliance.ts` holds the rule, with 10 tests in
`stopCompliance.test.ts` running under `node --test` — the pattern already used by
`campaignRunStatus.test.ts` in that folder, which actually executes rather than needing
vitest.

**The matcher is case-SENSITIVE `\bSTOP\b`, deliberately.** A case-insensitive check
would pass *"we'll stop by on Tuesday"* — a message containing no opt-out instruction at
all, that has now been "validated". That false pass is worse than a false block, because
it launders a non-compliant message through a check. Uppercase is also the carrier
convention and what the seeded default already uses, so it costs a compliant author
nothing. Both cases are tested.

**Guarded in the mutation, not just on the button.** A disabled button is a hint; the
`mutationFn` throw is the rule. Applies to create, send-now and edit.

**AI templates auto-correct rather than block** — `withStopSentence` appends if the model
omitted it, and the toast says so. `generate-campaign-templates` is instructed to include
the line, but an instruction is not a guarantee, and rejecting a template the owner just
asked for is a worse experience than quietly making it compliant.

**Email is correctly exempt.** In the wizard the guard applies only when the channel
includes SMS; a pure email campaign uses an unsubscribe link and must not carry a STOP
line. In `CampaignEditDialog` it applies unconditionally, because `automated_campaigns`
has **no `channel` column** and both senders are SMS-only — `run-inactive-campaign` reads
`organization_sms_settings` and sends via OpenPhone, `process-campaign-queue` is the
`campaign_sms` PGMQ worker. Every stored campaign body is sent as SMS.

**Noticed in passing, not fixed:** `CampaignsPage`'s `channelFilter` is declared, wired
to a tab, and included in the `useMemo` dependency array — but the `filteredCampaigns`
predicate never references it. The tabs change nothing except the `opted_out` branch.
