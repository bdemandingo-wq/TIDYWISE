# Two client-portal RPCs are callable by `anon` and take their identifiers from the caller

**Found:** 2026-08-04, while verifying the 2026-07-16 portal RPC revoke.
**Status:** open, not investigated in depth. Fix is a `GRANT`/`REVOKE`
migration, so it lives in `supabase/` and costs a Lovable credit.
**Severity:** unknown — needs the look this note is asking for.

## Context: the 2026-07-16 revoke DID land

Verified against the live database. Every data-reading portal RPC now has **no**
`anon` or `authenticated` EXECUTE grant, so each is reachable only through
`client-portal-api`, which calls `verifyPortalSession` first:

`get_client_portal_user_data`, `get_client_portal_bookings`,
`get_client_portal_locations`, `get_client_portal_notifications`,
`get_client_portal_requests`, `update_client_portal_profile`,
`update_client_portal_location`, `delete_client_portal_location`,
`delete_client_portal_notification`, `change_client_portal_password`,
`reset_client_portal_password`, `create_client_portal_referral`,
`update_client_portal_last_login`.

That backlog item can be marked verified.

## What is still open

Five RPCs remain `anon, authenticated`. Three are expected — `validate_client_portal_login`
and `hash_client_portal_password` are needed before a session exists, and
`is_client_portal_user(_user_id, _client_user_id)` returns a boolean and takes
both ids, so it is an ownership check rather than an enumeration oracle.

Two are worth a proper look:

### `create_client_portal_user(p_username, p_password, p_customer_id, p_organization_id, p_must_change_password)`

`SECURITY DEFINER`, granted to `anon`. Every identifier — including which
customer and which organisation the new portal login belongs to — comes from
the caller. If the function does not itself verify that the caller may act for
`p_customer_id`, an anonymous caller could create a portal login attached to
someone else's customer record, and then sign in as them.

Not verified either way. The function body needs reading before assuming the
worst *or* the best.

### `add_client_portal_location(p_client_user_id, p_name, p_address, ...)`

`SECURITY DEFINER`, granted to `anon`, and takes `p_client_user_id` from the
caller. If unchecked, an anonymous caller can add a service address to any
portal user. Lower impact than the above — writing an address, not reading data
— but it is a write to another tenant's records from an unauthenticated caller,
and addresses are exactly what a cleaning business dispatches staff to.

## What to check

1. Read both function bodies. Does either verify the caller against
   `auth.uid()`, or is the trust entirely in the arguments?
2. If unverified: does anything legitimate call them from the browser as `anon`?
   `create_client_portal_user` is plausibly used by an admin creating a portal
   login, which would be `authenticated`, not `anon`. If so the `anon` grant can
   go with no behaviour change — the same shape as the 2026-07-16 revoke.
3. `add_client_portal_location` is almost certainly only called from inside the
   portal, i.e. behind `client-portal-api`, in which case it needs no direct
   grant at all.

## Related

`docs/bugs/2026-08-04-create-setup-intent-unauthenticated.md` — same portal
surface, also an unauthenticated write, also deferred on credits.
