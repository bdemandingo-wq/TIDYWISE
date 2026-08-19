import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * user_id -> display name for members of one organization, for attributing
 * work to a teammate.
 *
 * Backed by get_org_member_names(), a SECURITY DEFINER function scoped to the
 * caller's own org. It returns user_id and a display name and nothing else —
 * no email, no role, no phone — so surfacing initials never required opening
 * profiles to every member of every organization.
 *
 * Not sourced from `staff`: only 14 of 44 members have staff rows and the
 * owner and all four managers have none, which is precisely the group whose
 * work needs attributing. Admins are office, not cleaners, and giving them
 * staff rows to satisfy a name lookup would put them on scheduling and payroll.
 *
 * A member with neither profiles.full_name nor staff.name resolves to null and
 * renders with no initials. There is deliberately no email fallback: the owner
 * account is support@tidywisecleaning.com, which would render as "S" — a
 * confidently wrong name on the heaviest user. Blank reads as unattributed.
 */
export function useOrgMemberNames(organizationId: string | undefined | null) {
  const [names, setNames] = useState<Record<string, string>>({});
  // The access token is a dependency, not just a precondition. organizationId
  // can resolve before the session token is attached to the client, and this
  // function is REVOKEd from anon — so an early call comes back 42501, hits the
  // early return, and never retries, because organizationId does not change
  // again. The map stays empty for the life of the page and nothing is logged.
  // Keying the effect on the token means the call re-fires the moment the
  // session lands.
  const { session } = useAuth();
  const accessToken = session?.access_token;

  useEffect(() => {
    // No token means the request would go out as anon and be rejected. Waiting
    // is not a delay, it is the difference between a result and a dead map.
    if (!organizationId || !accessToken) return;
    let cancelled = false;

    (async () => {
      // try/catch, not just the { error } field. Those are different failure
      // channels: `error` is what the server returned, and a throw is what
      // happens before the request is built at all — a bad client reference, a
      // network stack failure, a malformed argument. The this-binding bug threw
      // here and surfaced as an UNCAUGHT promise rejection, so the error branch
      // below never ran and nothing was logged. Anything that escapes this
      // function is invisible.
      try {
        // Cast the CLIENT, never the method.
        //
        // `const callRpc = supabase.rpc` detaches the function from its receiver.
        // supabase-js's rpc() reads `this.rest` internally, so a detached call
        // throws "Cannot read properties of undefined (reading 'rest')" BEFORE any
        // request is sent — which means no network error, no `error` field, and
        // nothing for the check below to catch. It presents as an empty map, which
        // is indistinguishable from an org with no members.
        //
        // Casting the client keeps `client.rpc(...)` a method call, so `this` is
        // still the client. The cast exists only because the function is not in
        // the generated RPC union yet; drop it once types are regenerated.
        type OrgMemberName = { user_id: string; display_name: string | null };
        const client = supabase as unknown as {
          rpc: (
            fn: 'get_org_member_names',
            args: { p_organization_id: string },
          ) => Promise<{ data: OrgMemberName[] | null; error: unknown }>;
        };

        const { data, error } = await client.rpc('get_org_member_names', {
          p_organization_id: organizationId,
        });

        if (cancelled) return;

        // Non-fatal, but no longer silent. A failed lookup still costs only
        // initials rather than the page — but swallowing it completely made an
        // empty map indistinguishable from "this org has no members", which cost
        // a full debugging round. One warn is what turns that into a two-second
        // console check.
        if (error) {
          console.warn('[useOrgMemberNames] name lookup failed:', error);
          return;
        }
        if (!data) return;

        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.user_id && row.display_name) map[row.user_id] = row.display_name;
        }
          setNames(map);
      } catch (err) {
        // Non-fatal by design — a failed lookup costs initials, never the page.
        // But it must be SEEN, and an unhandled rejection in a fire-and-forget
        // effect is the one thing that is not.
        if (!cancelled) console.warn('[useOrgMemberNames] name lookup threw:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [organizationId, accessToken]);

  return names;
}

/**
 * "Emmanuel Forkuoh" -> "EF". A single-word name gives one letter rather than
 * two of the same, and anything unresolvable gives '' so the caller renders
 * nothing instead of a placeholder that reads as a real person.
 */
export function initialsOf(name: string | undefined): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
