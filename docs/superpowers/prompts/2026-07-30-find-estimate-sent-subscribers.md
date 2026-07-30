# Lovable query — who has an `estimate.sent` automation that has never fired?

**Status:** read-only. Changes nothing. Safe to run any time.
**Why:** `estimate.sent` has never been dispatched from the Quotes screen. The dead
branches were deleted in `4bcef4f5` rather than revived, so it still will not fire.
Orgs subscribed to it are sitting on automations they believe work.
**Related:** `docs/bugs/2026-07-30-quotes-status-audit.md`

---

## What to look for

Two independent integrations can subscribe to `estimate.sent`, stored differently.

**Zapier** — `org_zapier_webhooks`, one row per (org, event_type, url):
```
event_type text NOT NULL, is_active boolean NOT NULL DEFAULT true
```
Subscribed = a row with `event_type = 'estimate.sent'` and `is_active`.

**GoHighLevel** — `org_ghl_settings`, one row per org, with an `event_config` JSONB
keyed by event name. `ghl-dispatch/index.ts:322-337` gates on three things in order:

```ts
if (!cfg?.webhook_url)                      → NOT_CONFIGURED
if (!isTest && !cfg.enabled)                → DISABLED
if (!mapping || mapping.enabled === false)  → EVENT_DISABLED
```

So a GHL org is subscribed when `webhook_url` is set, the row-level `enabled` is
true, the `estimate.sent` key **exists** in `event_config`, and its `enabled` is
not literally `false`. Note the asymmetry: an absent key skips, but a present key
with no `enabled` field does **not** skip.

---

## Query 1 — Zapier subscribers

```sql
select o.name                as organization,
       w.organization_id,
       w.name                as zap_name,
       w.is_active,
       w.created_at,
       left(w.webhook_url, 40) || '…' as webhook
from public.org_zapier_webhooks w
join public.organizations o on o.id = w.organization_id
where w.event_type = 'estimate.sent'
order by w.is_active desc, w.created_at;
```

Include inactive rows deliberately — an org that switched it off after seeing
nothing arrive is still an org that was misled, and is arguably the one most worth
contacting.

## Query 2 — GoHighLevel subscribers

```sql
select o.name            as organization,
       g.organization_id,
       g.enabled         as integration_enabled,
       (g.event_config -> 'estimate.sent' ->> 'enabled') as event_enabled_raw,
       g.updated_at
from public.org_ghl_settings g
join public.organizations o on o.id = g.organization_id
where g.webhook_url is not null
  and g.event_config ? 'estimate.sent'
order by g.enabled desc, g.updated_at desc;
```

`?` is the JSONB key-existence operator. `event_enabled_raw` is shown rather than
filtered so you can see the three states apart: `true`, `false`, and NULL (key
present, no `enabled` field — which **does** dispatch, per the gate above).

## Query 3 — the proof, and the thing worth checking first

The finding that `estimate.sent` never fired came from reading the code. This
checks it against what actually happened:

```sql
select 'zapier' as channel, event_type, count(*) as dispatches,
       count(*) filter (where success) as succeeded,
       min(created_at) as first, max(created_at) as last
from public.zapier_dispatch_log
group by event_type
union all
select 'ghl', event_type, count(*),
       count(*) filter (where success),
       min(created_at), max(created_at)
from public.ghl_dispatch_log
group by event_type
order by channel, event_type;
```

**`estimate.sent` should be absent from both halves entirely.** If it appears, the
code reading was wrong somewhere and the audit needs revisiting before anyone is
contacted — so run this one first.

Seeing which events *do* appear is also the useful control: it confirms the
dispatch pipeline works generally, which is what makes `estimate.sent`'s absence
meaningful rather than just "nothing has ever fired".

## Query 4 — the contact list

```sql
select distinct o.id, o.name, p.email, p.full_name, 'zapier' as via
from public.org_zapier_webhooks w
join public.organizations o  on o.id = w.organization_id
join public.org_memberships m on m.organization_id = o.id and m.role = 'owner'
join public.profiles p        on p.id = m.user_id
where w.event_type = 'estimate.sent'
union
select distinct o.id, o.name, p.email, p.full_name, 'ghl'
from public.org_ghl_settings g
join public.organizations o   on o.id = g.organization_id
join public.org_memberships m on m.organization_id = o.id and m.role = 'owner'
join public.profiles p        on p.id = m.user_id
where g.webhook_url is not null and g.event_config ? 'estimate.sent'
order by name;
```

`full_name` may be blank on owners who signed up after 2026-02-01 — that is the
separate `handle_new_user` regression in
`2026-07-30-fix-blank-owner-name-signup.md`. Running that backfill first will make
this list usable for a personalised message.

---

## What to tell them

Suggested substance, not wording — this is your call:

- Their `estimate.sent` automation has not been receiving events. Not intermittently: not at all.
- Nothing on their side is misconfigured. The event was never emitted.
- It has **not** been quietly switched on. Reviving it would have delivered a backlog-shaped surprise to automations nobody has tested, triggered by quotes being *edited* rather than sent — which is why it was removed instead.
- If sending a quote should trigger their automation, that is real work with a defined home (the SMS send path in `BookingStepper`), and you will scope it rather than guess.

Worth deciding before contacting anyone: whether `estimate.sent` is coming back at
all. "It never worked and we have removed it" and "it never worked and we are
building it properly" are different messages, and sending the first then doing the
second is worse than waiting a day to decide.
