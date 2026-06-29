## Zapier Integration Plan

Goal: let each organization's admin paste one or more Zapier webhook URLs and have the CRM POST event data to them when key things happen. Purely additive — no existing flow changes.

---

### 1. Database (1 new table)

`org_zapier_webhooks`
- `id` uuid pk
- `organization_id` uuid (FK, indexed)
- `name` text (admin label, e.g. "New customer → Google Sheet")
- `webhook_url` text (the Zapier catch hook URL)
- `event_type` text (which event triggers this hook)
- `is_active` boolean default true
- `created_by` uuid, `created_at`, `updated_at`

RLS:
- SELECT/INSERT/UPDATE/DELETE only for users in the same `organization_id` via `org_memberships` (admin role).
- `service_role` full access (edge function dispatcher).
- GRANTs to `authenticated` + `service_role` (no `anon`).

Optional `zapier_dispatch_log` (event, url, status, payload hash, ts) for audit — recommended.

---

### 2. Supported event types (v1)

Toggleable per webhook:
- `customer.created`
- `booking.created`
- `booking.completed`
- `booking.cancelled`
- `invoice.paid`
- `lead.created`
- `estimate.sent`
- `review.received`

(Easy to add more later — just a string enum on the frontend.)

---

### 3. Edge function: `zapier-dispatch`

- Input: `{ organization_id, event_type, payload }`
- Looks up active webhooks for that org + event_type
- POSTs JSON to each URL with `Content-Type: application/json`
- Logs result to `zapier_dispatch_log`
- Never throws back into the caller — fire-and-forget so it can't break CRM flows
- `verify_jwt = false` (called internally from other edge functions / DB triggers via service role)

---

### 4. Trigger points (where to call the dispatcher)

Add a single helper `dispatchZapier(event, payload)` invoked from the existing flows — no logic changes, just one extra call:
- customer create handler
- booking create / complete / cancel handlers
- invoice paid webhook (Stripe)
- lead create handler
- estimate send handler
- review intake handler

Each call is wrapped in try/catch so a Zapier failure never affects the real action.

---

### 5. Admin UI

New page: **Settings → Integrations → Zapier**
- List of configured webhooks (name, event, active toggle, test button, delete)
- "Add webhook" dialog: name, paste URL, pick event from dropdown
- "Send test" button → fires a sample payload to that URL so user can finish their Zap setup
- Link to Zapier "Webhooks by Zapier" docs

Only visible to org admins (checked via `org_memberships.role`).

---

### 6. Security / isolation (matches project rules)

- All reads/writes scoped to `organization_id` via RLS
- Webhook URL validated server-side (must be `https://hooks.zapier.com/...`)
- Dispatch function rejects if `organization_id` missing
- All sends logged with org_id + user_id (where applicable)
- No secrets needed — webhook URL is the auth token

---

### 7. Rollout order

1. Migration: table + RLS + grants
2. Edge function `zapier-dispatch` + log table
3. Admin Settings UI (list / add / test / delete)
4. Wire dispatch calls into the 8 event sources one by one

---

### Technical notes

- Payload shape per event will mirror the existing DB row plus an `event` and `occurred_at` field for consistency.
- Retries: v1 = no retries (Zapier itself retries on its side); log failures for visibility.
- Future: signed payloads (HMAC), per-webhook field filtering, GHL as a separate integration project.

Approve and I'll start with step 1 (migration).