# `create-setup-intent` attaches a card to any customer with no authentication

**Found:** 2026-08-04, while scoping client-portal card updates.
**Status:** open. Deliberately not fixed — the fix is in `supabase/`, and the
Lovable credit is being held. Log for when credits reset.
**Severity:** enables a chargeback against the organisation.

## What

`supabase/functions/create-setup-intent/index.ts` is `verify_jwt = false` and
takes `email`, `customerName` and `organizationId` from the request body. When
the body carries `publicBooking: true`, it skips authentication entirely:

```ts
if (publicBooking) {
  // Public booking flow: no auth required, but org must exist
  console.log("Public booking card setup for:", { email, customerName, organizationId });
} else {
  const authResult = await verifyAdminAuth(..., { requireAdmin: true, requireOrganizationId: organizationId });
}
```

So anyone who can reach the function — it is public — can mint a SetupIntent
against **any email address in any organisation** and attach a card to that
Stripe customer.

## Why it matters: the chargeback lands on the org

A SetupIntent client secret only permits attaching a payment method. It cannot
read an existing card, so nothing leaks. The damage is downstream.

Both charge paths resolve the card to use **from Stripe at charge time**, not
from any app-side reference:

- `charge-customer-card/index.ts:145` — `customer.invoice_settings?.default_payment_method`,
  falling back to `stripe.paymentMethods.list()`
- `charge-card-directly/index.ts:186, 257-262` — same pattern

So an attacker who attaches their own card to a victim customer can become that
customer's **default payment method**. The next time the organisation charges
that customer, it charges the attacker's card. The attacker then disputes it.

The dispute is filed against the **connected account** — the cleaning business —
which pays the dispute fee and loses the amount, for a job it really performed
for a different person. The org has no way to see this coming: from its side the
charge succeeded against a card on file.

This is not theoretical for this platform; disputes are already a recurring
cost.

## Why it is not fixed yet

The client portal's card-update feature reuses `publicBooking: true`, because
the portal is frontend-only work and editing this function is not. The portal
does **not** widen the exposure — the same call is already reachable from the
public booking page by anyone — but it does mean an authenticated portal user
changing their own card goes through an unauthenticated endpoint.

## Fix

The portal already mints a signed session: `client-portal-login` issues an HS256
JWT signed with `PORTAL_SESSION_SECRET`, and `_shared/portal-session.ts` exports
`verifyPortalSession(req, supabase)`, which HMAC-verifies it, checks expiry and
confirms the user still exists.

Add a third branch to `create-setup-intent`:

1. `publicBooking: true` — genuinely anonymous, only reachable from the public
   booking page. Keep, but constrain: the email must not already belong to an
   existing `client_portal_users` row for that organisation. A brand-new
   customer booking for the first time is the legitimate case; attaching to an
   established customer is not.
2. A portal session token — verify with `verifyPortalSession`, then force
   `email` and `organizationId` from the **verified claims**, ignoring whatever
   the body said.
3. Admin JWT — unchanged.

Step 2 is the one that makes the portal path honest. Step 1 is what actually
closes the vector.

## Related

`docs/bugs/2026-08-04-portal-rpcs-anon-callable.md` — separate finding, same
portal surface.
