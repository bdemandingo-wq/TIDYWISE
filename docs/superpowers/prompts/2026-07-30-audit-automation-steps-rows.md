# Lovable query — does any org already have copy in `automation_steps`?

**Status:** read-only. Changes nothing. Safe to run any time.
**Why:** this is the **gate on everything after task 1** in
`docs/superpowers/plans/2026-07-30-editable-automation-messages.md`. Do not start task 3
(migrating a sender to read `automation_steps`) until this has been run and the results
reviewed.

---

## The hazard being checked

`AutomationEditorDialog` has been live and writing to `automation_definitions` /
`automation_triggers` / `automation_steps` since migration `20260707060120`. It is a
complete, convincing authoring UI: SMS body, email subject, email body, multi-step
sequences, and a **"Automation saved" success toast**.

**No sender reads any of it.** So every owner who used it wrote copy, was told it saved,
and reasonably concluded their automation now sends that message. It never did.

**The moment a sender starts reading that table, all of that copy goes live at once** —
untested, never reviewed, possibly a half-finished draft, possibly written a year ago as
an experiment, possibly rude about a specific customer. Nobody would find out until a
customer received it.

That is why this runs before the migration rather than as part of it. It costs minutes;
discovering it afterwards is unrecoverable.

---

## Query 1 — is there anything there at all?

```sql
select d.automation_key,
       count(distinct d.organization_id)              as orgs,
       count(s.id)                                    as steps,
       min(s.created_at)                              as first_edit,
       max(s.updated_at)                              as last_edit
from public.automation_definitions d
left join public.automation_steps s on s.automation_id = d.id
group by d.automation_key
order by count(s.id) desc, d.automation_key;
```

**If this returns no rows, the plan is unblocked** — nobody has ever used the editor,
there is no dormant copy, and senders can begin reading the table with only seeded
defaults present. That is the good outcome and it makes task 3 straightforward.

## Query 2 — the actual copy, so it can be eyeballed before it ever sends

Only needed if query 1 returned rows.

```sql
select o.name                                as organization,
       d.automation_key,
       d.enabled                             as definition_enabled,
       s.position,
       s.channel,
       s.recipient_client, s.recipient_cleaner, s.recipient_owner,
       s.sms_body,
       s.email_subject,
       left(coalesce(s.email_body,''), 300)  as email_body_start,
       s.created_at, s.updated_at
from public.automation_steps s
join public.automation_definitions d on d.id = s.automation_id
join public.organizations o          on o.id = s.organization_id
order by o.name, d.automation_key, s.position;
```

**Read every `sms_body` and `email_subject` in full.** This is the one place where a
human has to look rather than a count being sufficient — the question is not "how many"
but "would I be happy for a customer to receive this tomorrow".

## Query 3 — which of it would go live first

Task 3 migrates `quote_stale_reengage`. This is the subset that migration would
activate:

```sql
select o.name, d.enabled, s.channel, s.sms_body, s.updated_at
from public.automation_steps s
join public.automation_definitions d on d.id = s.automation_id
join public.organizations o          on o.id = s.organization_id
where d.automation_key = 'quote_stale_reengage'
order by s.updated_at desc;
```

## Query 4 — confirm the schema still matches the migration

Rule 4b: the migration file is a hypothesis, and this plan builds directly on the
schema's shape.

```sql
select column_name, data_type, is_nullable, column_default, is_generated
from information_schema.columns
where table_schema = 'public' and table_name = 'automation_steps'
order by ordinal_position;

select conname, contype, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.automation_steps'::regclass
order by contype, conname;
```

Expected from `20260707060120`: `channel` CHECK in `(sms, email, both)`, `offset_unit`
CHECK in `(minutes, hours, days)`, `direction` CHECK in `(before, after, immediate)`, a
**generated** `offset_minutes`, and the conflict-detection trigger. **`message_class`
should NOT exist yet** — adding it is task 2.

---

## What to do with the answer

| Result | What it means for the plan |
|---|---|
| **No rows anywhere** | Unblocked. Task 3 proceeds; the only copy in the table will be what the migration seeds. |
| **Rows exist, `quote_stale_reengage` empty** | Task 3 proceeds safely, but tasks 4+ need a per-org activation step rather than silently going live. |
| **Rows exist for `quote_stale_reengage`** | Task 3 needs an explicit activation decision. Options: seed over them, require the owner to re-confirm before their copy goes live, or migrate with the hardcoded default and let owners opt in. |
| **Anything embarrassing in query 2** | Contact those orgs before migrating. A draft written in frustration and forgotten is exactly what this query exists to find. |

**Do not delete rows on the strength of this.** An owner's saved copy is their work, even
if it never sent — deleting it is worse than leaving it dormant, and the decision about
activation is theirs.
