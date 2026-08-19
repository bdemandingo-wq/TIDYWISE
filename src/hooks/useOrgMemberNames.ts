import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    (async () => {
      // Cast until Lovable regenerates src/integrations/supabase/types.ts: the
      // function is not in the generated RPC union yet, so the name literal is
      // rejected. Narrowed to the row shape rather than `any` so the loop below
      // stays checked. Drop the cast once types are regenerated.
      type OrgMemberName = { user_id: string; display_name: string | null };
      const callRpc = supabase.rpc as unknown as (
        fn: 'get_org_member_names',
        args: { p_organization_id: string },
      ) => Promise<{ data: OrgMemberName[] | null; error: unknown }>;

      const { data, error } = await callRpc('get_org_member_names', {
        p_organization_id: organizationId,
      });

      // Swallowed on purpose. A failed name lookup costs initials, never the
      // page. It also makes this safe to ship before the function exists: the
      // RPC 404s, the map stays empty, and every surface renders as it does
      // today rather than erroring.
      if (cancelled || error || !data) return;

      const map: Record<string, string> = {};
      for (const row of data) {
        if (row.user_id && row.display_name) map[row.user_id] = row.display_name;
      }
      setNames(map);
    })();

    return () => { cancelled = true; };
  }, [organizationId]);

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
