# Lovable prompt — portal email-change request action

**Status:** not yet run
**Frontend:** already committed and pushed to `main` (`PortalProfileTab`). **Do not publish `main` before this deploys** — until then the button surfaces a visible error.
**Target:** `supabase/functions/client-portal-api/index.ts` on `slwfkaqczvwvvvavkgpr`

## Why this shape

Email is the portal login credential — `client-portal-login:36,72` resolves identity by it. Self-serve change would need verification of the new address, the old one staying valid until confirmed, collision handling inside the org, and a lockout recovery path. This action only notifies; an admin makes the change.

**Notification channel:** `admin_system_notifications`, matching the convention at `notify-time-off-request:42-50`. Deliberately **not** `notify-booking-request`, which is SMS-only via OpenPhone and silently returns `success: true` with `"SMS not enabled - skipping"` when OpenPhone isn't configured (`:129`, `:140`) — an org without SMS would get nothing.

## The prompt

```
Please add one new action to the edge function client-portal-api and deploy it.

ACTION: "request_email_change"

Context: the client portal's email field is read-only because email is the login
credential — client-portal-login resolves identity by it. Rather than build
self-serve email change (which needs verification, collision handling and a
lockout recovery path), the customer requests it and an admin makes the change.

THIS ACTION ONLY NOTIFIES. It must never modify customers.email.

Add it alongside the existing cases, following their structure:

case "request_email_change": {
  // 1. Read and normalise the requested address.
  const raw = typeof body?.p_new_email === "string" ? body.p_new_email : "";
  const newEmail = raw.trim().toLowerCase();

  // 2. Validate LOOSELY. An admin confirms the address before acting, so
  //    rejecting an unusual-but-valid address here would be worse than passing
  //    it along. Block only blank, malformed, and absurdly long.
  if (!newEmail || newEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return err("A valid email address is required", 400);
  }

  // 3. Identity comes from the VERIFIED SESSION, as in every other case here.
  //    customer_id and organization_id are already resolved above. Never trust
  //    an id from the body.

  // 4. Load the customer's current details for the notification message.
  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .select("first_name, last_name, email")
    .eq("id", customer_id)
    .maybeSingle();
  if (custErr) return err(custErr.message, 500);
  if (!cust) return err("Customer not found", 404);

  const currentEmail = (cust.email ?? "").trim().toLowerCase();
  if (currentEmail && currentEmail === newEmail) {
    return err("That is already your email address", 400);
  }

  // 5. Notify the business. Same table and field shape as
  //    notify-time-off-request:42-50.
  const customerName = `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim() || "A customer";

  const { error: notifyErr } = await supabase
    .from("admin_system_notifications")
    .insert({
      organization_id: organization_id,
      type: "email_change_request",
      title: "Email change requested",
      message:
        `${customerName} asked to change their sign-in email from ` +
        `${currentEmail || "(none on file)"} to ${newEmail}`,
      link: `/dashboard/customers?customer=${customer_id}`,
      metadata: {
        customer_id: customer_id,
        current_email: currentEmail,
        requested_email: newEmail,
        source: "client_portal",
      },
      dedupe_key: `email_change_req:${customer_id}:${newEmail}`,
    });

  // 6. A duplicate dedupe_key means this exact request is ALREADY recorded, so
  //    it is a success from the customer's point of view, not an error. Without
  //    this, a customer pressing the button twice sees a failure for a request
  //    that went through. 23505 = unique violation.
  if (notifyErr && (notifyErr as { code?: string }).code !== "23505") {
    return err(notifyErr.message, 500);
  }

  return ok({ success: true });
}

REQUIREMENTS AND PROHIBITIONS

- The requested address MUST appear in `message`, so the admin does not have to
  ask the customer what they wanted it changed to.
- Do NOT update customers.email. Do NOT touch client_portal_users.
- Do NOT send SMS. notify-booking-request skips silently when OpenPhone is not
  configured, so the notification bell is the only reliable channel here.
- Do NOT check whether the requested address already exists in the org. That
  would leak whether an address is registered, from an endpoint reachable by any
  portal session. The admin can see collisions when they make the change.

ALSO PLEASE REPORT: whether dedupe_key has a unique constraint, since that
determines whether the 23505 branch can ever fire.

  select conname, contype, pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid = 'public.admin_system_notifications'::regclass;

If it does NOT have one, tell me — the dedupe_key is then decorative and repeat
presses will each add a bell row, which needs a different guard.

Confirm the function is DEPLOYED, not just committed.
```

## After it deploys

1. Publish `main` so the frontend button works.
2. Check the bell: a request should appear as "Email change requested" with both addresses in the message and a link to the customer.
3. If `dedupe_key` has no unique constraint, decide the spam guard — either add the constraint or rate-limit the action via `_shared/rate-limit.ts`.

## Known limitation, accepted deliberately

There is **no durable request record** — only the notification. If an admin dismisses it, the request is gone and the customer gets no status. For an action taken once every few years that was judged acceptable; the upgrade is a `client_email_change_requests` table with a status the portal can display. Flagged so it is a known trade-off rather than a surprise.
