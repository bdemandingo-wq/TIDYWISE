## Goal

Add a first-class **GoHighLevel (GHL)** destination in Settings → Integrations that runs in parallel with Zapier. You'll be able to paste a GHL webhook URL + auth token, choose which events fire, map which fields each event sends, fire a test, and see every delivery attempt with retry buttons.

## What gets built

### 1. GHL Settings card
- Webhook URL field (validated — must look like a GHL inbound webhook / custom URL).
- Optional `Authorization` header / bearer token field (stored encrypted server-side, never returned to the client).
- Master enable/disable switch.
- Inline step-by-step setup guide (create a Workflow → add "Inbound Webhook" trigger → copy URL → optionally enable auth → paste here).

### 2. Event mapper
For each of the 8 event types (`customer.created`, `booking.created`, `booking.completed`, `booking.cancelled`, `invoice.paid`, `lead.created`, `estimate.sent`, `review.received`):
- Toggle to enable/disable that event for GHL.
- A field-mapping table: source field (from our payload, e.g. `customer.email`) → GHL field (e.g. `email`, `phone`, `firstName`, `tags[]`, custom field key). Pre-filled with sensible defaults per event.
- Live JSON preview of what will be sent.

### 3. "Test GHL Webhook" button
- One button per event type that fires the sample payload through the real dispatch pipeline (using the saved mapping + auth) and shows the response status, body, latency, and any error inline.

### 4. Delivery log
- New `ghl_dispatch_log` table (org-scoped, RLS).
- UI card mirroring the Zapier log: search, filters (event type, status), latency column, response snippet on hover, **Retry** button per failed row.

### 5. Dispatch engine
- New edge function `ghl-dispatch` (mirrors `zapier-dispatch`): exponential backoff (4 retries on 5xx/429), structured error messages (network / 4xx / 5xx / auth / rate-limit), and friendly troubleshooting hints stored on the failed log row (e.g. "401 → token rejected, regenerate in GHL → Settings → Private Integrations").
- Wired into the same 8 emission points already firing Zapier, so when GHL is enabled it dispatches in parallel — Zapier failures don't block GHL and vice-versa.

## Technical details

**New table `org_ghl_settings`** (one row per org)
- `organization_id`, `enabled`, `webhook_url`, `auth_header_name`, `auth_token` (REVOKE column-level SELECT on `auth_token` — only edge functions read it via SECURITY DEFINER RPC), `event_config` (JSONB: `{ "lead.created": { enabled: true, fields: { email: "customer.email", ... } }, ... }`).

**New table `ghl_dispatch_log`**
- `organization_id`, `event_type`, `status` (`success`|`failed`|`retrying`), `http_status`, `attempt`, `latency_ms`, `payload` (JSONB), `response_snippet`, `error_code`, `error_hint`.
- RLS: org admins read; service role writes.

**Edge function `ghl-dispatch`** modes:
- `dispatch` (called from existing emission points + `dispatchGhlEvent` helper).
- `test` (fires sample payload, returns full response).
- `validate_webhook` (HEAD/POST ping for the health UI).
- `retry_log_id` (re-fires a stored failed payload).

**Frontend files**
- `src/lib/ghl.ts` — `dispatchGhlEvent(eventType, payload)` helper.
- `src/components/admin/GHLSettingsCard.tsx`
- `src/components/admin/GHLEventMapper.tsx`
- `src/components/admin/GHLEventTester.tsx`
- `src/components/admin/GHLDispatchLogCard.tsx`
- Wired into `src/pages/admin/SettingsPage.tsx` Integrations tab, directly under the Zapier section.

**Wiring existing emission points** (already calling `dispatchZapierEvent`): add a parallel `dispatchGhlEvent` call in the same 5 source files — `useBookings.ts`, `QuotesTabContent.tsx`, `LeadsPage.tsx`, `ClientFeedbackPage.tsx`, `stripe-invoice-webhook/index.ts`.

## What I will NOT do (call out if you want it)
- Two-way sync from GHL back into the CRM (would need GHL Private Integration token + polling/webhooks back — separate build).
- Per-user GHL OAuth (workspace-level token only).
- Custom field discovery from the GHL API (mapper uses free-text GHL field names you type in).

Ready to build?
