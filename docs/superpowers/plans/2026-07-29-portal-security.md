# Portal Security — Findings and Plan

> Read-only investigation, 2026-07-29. Nothing changed. Every claim below was checked against the code.

**Recommended order: 3 → 2 → 1.** Reasoning in "Order and cost" at the end.

---

## Item 1 — Eight portal RPCs: real, but not what the summary says

The header of `client-portal-api` confirms the intent: a session-validated proxy was built for **10** SECURITY DEFINER functions, because the client portal has no Supabase Auth session — every portal browser request is `anon` with no `auth.uid()`, so *an in-function check cannot fix this*; identity has to be established server-side before the SQL runs.

These eight are a second batch that never got proxied. Confirmed: **none of the eight appears in `client-portal-api`**, and **none has a REVOKE anywhere in the migrations**. Seven are granted to `anon`.

But "each takes an id and trusts it" is not accurate, and the difference changes the priority. Three distinct shapes:

### (a) Pair-validated IDOR — five functions

`client_cancel_booking`, `delete_client_portal_location`, `delete_client_portal_notification`, `mark_client_notification_read`, `delete_client_booking_request`.

These **do** check internally. `client_cancel_booking` joins bookings to customers under a "verify ownership" comment; `mark_client_notification_read` uses `WHERE id = p_notification_id AND client_user_id = p_client_user_id`; `delete_client_portal_location` resolves `customer_id` from the portal user first.

What they verify is that **the two ids are consistent with each other**. What they cannot verify is that **the caller is the owner** — there is no caller identity to check. So an attacker holding a *matching pair* of UUIDs can cancel that booking or delete that location, and the function will happily agree the pair is valid.

Both are UUIDv4, so this is not enumerable. It requires obtaining real pairs — a leaked URL, a shared device, or a prior data exposure. Note that a client-portal anon-RPC PII/IDOR exposure was fixed on 2026-07-16; if ids leaked then, they are still valid now.

**Real, not mass-exploitable.**

### (b) Credential oracle — one function

`change_client_portal_password(p_user_id, p_current_password, p_new_password)`.

**It verifies the current password** (`IF v_stored_hash != extensions.crypt(p_current_password, v_stored_hash)`). So this is *not* "anyone with a customer's ID can change their password" — a takeover needs the existing password.

What it is: an **unauthenticated oracle**, callable by `anon` with no rate limiting at the database layer. It returns `'User not found'` and `'Current password is incorrect'` as distinct responses, which gives both user enumeration and unlimited offline-speed password guessing against a known id.

**The one item here needing the least prior knowledge — do it first within item 1.**

### (c) Cross-tenant config read — one function

`get_loyalty_tier_info(p_organization_id)` takes an **organization** id, not a customer id, and returns tier names, spending thresholds, benefits and colours. Business configuration, not personal data. Granted to `authenticated, service_role` — **not `anon`**, so the "callable by anon" framing does not apply to this one.

**Lowest severity by a wide margin.** Arguably close to public information.

> `submit_client_booking_request` (7 args, anon) was not read line-by-line. It creates a booking request and needs the same treatment; assume pair-validated until confirmed.

### Fix

Extend `client-portal-api` with a case per function, calling each with the service-role client using **only** ids resolved from the verified session token, ignoring any id in the request body — exactly the pattern the existing 10 already follow. Then `REVOKE` from `anon` and `authenticated`, granting `service_role` only.

**The regression risk is the revoke, not the proxy.** Any portal screen still calling these RPCs directly breaks the moment the grant is dropped. Front-end call sites must be migrated to the proxy *and deployed* before the revoke lands.

---

## Item 2 — `reset_client_portal_password`: confirmed exactly as described

Four lines, `SECURITY DEFINER`, no `auth.uid()`, no org scoping:

```sql
UPDATE client_portal_users
SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    must_change_password = true, updated_at = now()
WHERE id = p_user_id;
```

Any caller who could execute it could set any portal user's password. **It is currently REVOKEd from PUBLIC, `anon` and `authenticated`, granted only to `service_role`** — which is why the admin reset button is broken. The lockdown is correct; the missing piece is the authorised path.

**Do not re-grant it.** Add an edge function that calls `requireOrgAdmin` (already exists at `_shared/requireOrgAdmin.ts`), verifies the target portal user belongs to that admin's organisation, then calls the RPC as service role.

---

## Item 3 — `seasonal-promo-sender`: confirmed, live, and worse than silent

```ts
const { data: bsRow } = await supabase
  .from("business_settings")
  .select("company_name, booking_link, slug")
```

Neither `booking_link` nor `slug` exists on `business_settings` — 68 columns, neither present. PostgREST rejects the whole select with `42703`, so `bsRow` is null.

**The `error` is not destructured at all**, so nothing is logged. Two consequences, both live:

1. `bookingLink` falls back to `https://app.jointidywise.com` — the bare platform URL. Every org's customers get a link to TidyWise rather than that business's booking page.
2. `companyName` falls back to the organisation name instead of the configured `company_name`.

`slug` lives on **`organizations`**, and four other senders read it correctly — `process-campaign-queue`, `send-followup-campaign`, `send-referral-invite`, `process-rebooking-reminders` all use `${appUrl}/book/${org.slug}`.

**Fix:** read `slug` from `organizations` like the other four, keep `company_name` from `business_settings` as its own select, and destructure `error` so the next mistake of this shape is not silent.

---

## Order and cost

**1. Item 3 first — ~15 minutes, one function, no security risk.**
It is actively costing bookings right now: every seasonal promo sends customers to the wrong site. Cheapest fix in the set, largest immediate business return, and it cannot break anything else. There is no reason for it to wait behind a security review.

**2. Item 2 second — ~1 hour, one new edge function plus a front-end call swap.**
Small, well-bounded, and it restores a broken admin feature rather than risking a working one. The `requireOrgAdmin` pattern already exists, so this is assembly rather than design. Nothing is currently exploitable — the function is revoked — so this is closing a gap while fixing a bug.

**3. Item 1 last — ~half a day, and it needs a clear head.**
Eight proxy cases, eight front-end call-site migrations, then eight revokes, in that order and deployed in that order. The proxy work is mechanical; the revoke is where the portal breaks for real customers if a call site was missed. It deserves the slot where nothing else is competing for attention, which is exactly what doing 3 and 2 first buys.

**One exception worth pulling forward:** `change_client_portal_password`. It is the only genuinely unauthenticated attack primitive here — no matching pair required, and it doubles as a user-enumeration oracle. If item 1 slips, do that one on its own.

**Sequencing note:** items 2 and 3 are independent of everything. Item 1 touches `client-portal-api`, which item 2 does not, so they cannot conflict.
