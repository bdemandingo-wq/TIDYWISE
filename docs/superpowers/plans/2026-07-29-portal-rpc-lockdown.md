# Item 1: Lock Down the Eight Portal RPCs — Plan

> Planning only. Nothing changed. Sequence is **proxy → frontend → revoke**, deployed in that order, because the revoke is the step that breaks the portal for a real customer if a call site was missed.

---

## The call-site inventory

This is what the plan rests on. Nine call sites across five files. Every one is a direct `supabase.rpc(...)` from portal code — there are no dynamic or indirect invocations, and no server-side callers.

| RPC | Call site | Ids it passes today |
|---|---|---|
| `change_client_portal_password` | `src/contexts/ClientPortalContext.tsx:403` | portal user id + current + new password |
| `client_cancel_booking` | `src/pages/portal/PortalDashboardPage.tsx:440` | booking id, customer id |
| `delete_client_portal_notification` | `src/pages/portal/PortalDashboardPage.tsx:402` | notification id, portal user id |
| `mark_client_notification_read` | `src/pages/portal/PortalDashboardPage.tsx:382` | notification id, portal user id |
| `mark_client_notification_read` | `src/pages/portal/PortalDashboardPage.tsx:397` | **second call site — easy to miss** |
| `delete_client_booking_request` | `src/pages/portal/PortalDashboardPage.tsx:421` | request id, portal user id |
| `delete_client_portal_location` | `src/components/portal/PortalProfileTab.tsx:228` | portal user id, location id |
| `get_loyalty_tier_info` | `src/components/portal/PortalProfileTab.tsx:108` | organization id |
| `submit_client_booking_request` | `src/pages/portal/PortalRequestPage.tsx:250` | portal user id, customer id, org id, date, service, notes, location |

**`mark_client_notification_read` has two call sites**, twelve lines apart in the same file — one standalone, one inside the delete path. A grep that stops at the first hit misses the second, and the revoke would then break notification-reading. That single row is the reason this inventory exists.

`PortalDashboardPage.tsx` holds four of the eight, so it carries most of the risk.

**None of the eight has a proxy case today.** `client-portal-api` handles eleven actions — `get_bookings`, `get_requests`, `get_notifications`, `get_locations`, `get_tax_report`, `update_profile`, `add_location`, `create_referral`, `update_last_login`, `get_user_data`, `get_referrals` — and none of them is one of these. All eight need a case built.

---

## How each maps onto the verified session

The proxy already resolves `{ portal_user_id, customer_id, organization_id }` from the validated token and passes only those into the RPCs. Same reasoning as `admin-reset-portal-password`: **the ids come from the session, never from the request body.**

| RPC | Session ids | Body may supply |
|---|---|---|
| `change_client_portal_password` | `portal_user_id` | current + new password only |
| `client_cancel_booking` | `customer_id` | `bookingId` |
| `delete_client_portal_notification` | `portal_user_id` | `notificationId` |
| `mark_client_notification_read` | `portal_user_id` | `notificationId` |
| `delete_client_booking_request` | `portal_user_id` | `requestId` |
| `delete_client_portal_location` | `portal_user_id` | `locationId` |
| `submit_client_booking_request` | `portal_user_id`, `customer_id`, `organization_id` | date, service, notes, location |

The resource id (booking, notification, location, request) still comes from the body — it has to, since it names *which* one. The safety comes from the RPCs' existing pair-checks: they verify the resource belongs to the identity, and that identity is now session-derived rather than caller-asserted. Pair-check plus trusted identity equals real authorization; pair-check alone was the gap.

---

## `get_loyalty_tier_info` — it does not belong in this batch

It takes an **organization** id, not a customer id, and returns tier names, spending thresholds, benefits and colours. Business configuration, not personal data. It is granted to `authenticated, service_role` and **not to `anon`**, so it is not part of the anon exposure the other seven share.

It also cannot be fixed the same way. There is no resource-to-owner pair to validate — one argument, and the natural "session" mapping would be `organization_id` from the token, which is exactly what the caller passes today. Proxying it changes nothing about who can read what; it only moves the call.

**Recommendation: drop it from this batch.** Seven RPCs, not eight. What it actually is: any logged-in user of any org can read any other org's loyalty tier configuration. That is a genuine cross-tenant config read and worth closing, but it is a different fix — an org-membership check inside the function, or an RLS-backed view — and bundling it here inflates the risky batch for no security gain.

If it must move, move it *after* the seven are done and verified.

---

## `change_client_portal_password` — proxying is necessary but not sufficient

It **verifies the current password**, so it is not an account-takeover primitive. Proxying removes the anon exposure and is worth doing regardless.

But two properties survive proxying, and both should be addressed in the same pass:

**1. The distinct error strings are an enumeration oracle.** It returns `'User not found'` and `'Current password is incorrect'` as different responses. Post-proxy the caller must already hold a valid session, which removes the anonymous enumeration — but a signed-in customer can still distinguish valid portal user ids from invalid ones. Since the proxy will supply `portal_user_id` from the session, `'User not found'` becomes unreachable in normal operation anyway. **Collapse both to one message** — "Current password is incorrect" — and log the distinction server-side. Two identical-looking failures should look identical to the caller.

**2. There is no rate limit anywhere.** Proxying puts it behind a session, which raises the cost of guessing from "free" to "needs one valid login", but a customer can still brute-force their *own* account's password endlessly, and more importantly the endpoint becomes a convenient oracle if a session ever leaks. Add a simple per-portal-user attempt limit in the proxy case — a handful of failures in a short window, then refuse. This is the one place in the eight where the fix is behavioural rather than structural.

---

## `submit_client_booking_request` — close the `p_location_id` gap

Two overloads exist and both are live: the 6-arg original and a 7-arg version adding `p_location_id`. `CREATE OR REPLACE` with a different signature adds an overload rather than replacing, so both remain callable.

Both validate a **triple** — `client_user_id`, `customer_id`, `organization_id` must be mutually consistent and the portal user active — which makes this the most carefully checked of the eight. Except for one argument: **`p_location_id` is inserted with no validation at all** that the location belongs to that customer. Every other id in the function is checked; that one is not.

The frontend passes it conditionally (`if (selectedLocation && !isSyntheticPrimaryAddress)`), so a legitimate caller sends one of their own. A crafted call can send any location id in the database.

Fix inside the SQL, in the same pass: validate `p_location_id` belongs to `p_customer_id` before insert, and raise the same way the triple-check does. Also **drop the orphaned 6-arg overload** once the frontend is confirmed on the 7-arg signature — two live signatures for one operation is a second door to remember to lock.

---

## Deployable steps

Each step is independently deployable and independently verifiable. **Do not compress them** — the ordering is the safety property.

### Step 1 — Proxy cases *(Lovable)*
Add seven cases to `client-portal-api`, each taking its identity from the session and only the resource id from the body. Deploy. **Nothing changes for customers yet**: the RPCs are still granted, the frontend still calls them directly, and the new cases are simply unused. Verifiable in isolation by calling the proxy with a valid session.

### Step 2 — `submit_client_booking_request` location check *(Lovable)*
Migration adding the `p_location_id` ownership validation. Independent of the proxy work; can land in parallel with step 1. Deploy and verify a foreign location id is rejected.

### Step 3 — Frontend call sites *(mine — `src/`)*
Swap all nine call sites to `client-portal-api` actions, stop passing session ids from the client, and read errors via `readEdgeFunctionError`. Publish.

**This is the step that must be complete before step 5**, and `PortalDashboardPage.tsx`'s four call sites — including the duplicated `mark_client_notification_read` — are where a miss would hide.

### Step 4 — Verify in the live portal *(you)*
With the frontend on the proxy but the grants still in place, exercise every path as a real portal customer: change password, cancel a booking, mark a notification read, delete a notification, delete a booking request, delete a location, submit a booking request with and without a location.

Anything still broken here is broken *before* the revoke removes the fallback. That is the whole point of putting this step between them.

### Step 5 — Revokes *(Lovable)*
Migration revoking EXECUTE from `anon` and `authenticated` on the seven, granting `service_role` only. Deploy.

**Only after step 4 passes.** If a call site was missed, this is where a customer's portal breaks — and the failure will be a bare 42501 with no fallback path.

### Step 6 — `get_loyalty_tier_info`, separately
Its own decision, its own fix, after the seven are verified.

---

## Rollback

Steps 1, 2 and 3 are additive and safe. **Step 5 is the only one with a blast radius**, and its rollback is a one-line re-grant — worth having written and ready before deploying it rather than composed under pressure.

---

## Definition of done

1. All nine call sites go through `client-portal-api`; no portal code calls these RPCs directly.
2. Every proxy case takes its identity from the session, never the body.
3. The seven are revoked from `anon` and `authenticated`.
4. `change_client_portal_password` returns one indistinguishable failure message and rate-limits attempts.
5. `p_location_id` is validated; the orphaned 6-arg overload is dropped.
6. Every portal flow in step 4 still works after the revoke.
7. `get_loyalty_tier_info` is tracked separately, not quietly bundled.
