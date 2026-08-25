import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { clearSidebarHiddenItemsCache } from '@/hooks/useSidebarHiddenItems';

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  owner_id: string;
}

export type OrgRole = 'owner' | 'admin' | 'manager' | 'member';

interface OrganizationMembership {
  organization_id: string;
  role: OrgRole;
}

interface OrgWithRole {
  organization: Organization;
  role: OrgRole;
}

interface OrganizationContextType {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  loading: boolean;
  /** True for ~500ms after switchOrganization while queries refetch */
  switching: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  /** All organizations the current user belongs to */
  allOrganizations: OrgWithRole[];
  /** Switch the active organization */
  switchOrganization: (orgId: string) => void;
  refetch: () => Promise<void>;
}

const ACTIVE_ORG_KEY = 'tidywise_active_org';
/** Set by switchOrganization to distinguish a deliberate choice from a default. */
const ORG_CHOSEN_KEY = 'tidywise_org_chosen';

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [allOrganizations, setAllOrganizations] = useState<OrgWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracks which user we last RESOLVED orgs for. Fixes the sign-in flash:
  // after logging out (or on the login page) state settles at
  // { organization: null, loading: false }. The instant a user signs in,
  // the fetch starts async — but consumers (AdminRoute) still read the
  // stale "not loading, no org" state and redirect existing users to
  // /onboarding for ~300ms until their org arrives. Flipping loading=true
  // synchronously whenever we fetch for a not-yet-resolved user closes
  // that window on web, desktop, and the iOS app alike. Token refreshes
  // (same user id) intentionally do NOT toggle loading, so the dashboard
  // doesn't flicker every time the session renews.
  const resolvedUserIdRef = useRef<string | null>(null);

  // Core fetch logic, parameterized by userId so it can be called both
  // from the useEffect (with closure user) and imperatively from the
  // signup handler (with the session user, bypassing stale closure).
  const fetchOrgForUser = useCallback(async (userId: string) => {
    if (resolvedUserIdRef.current !== userId) {
      setLoading(true);
    }

    try {
      const { data: memberships, error: membershipError } = await supabase
        .from('org_memberships')
        .select('organization_id, role')
        .eq('user_id', userId);

      if (membershipError || !memberships || memberships.length === 0) {
        setOrganization(null);
        setMembership(null);
        setAllOrganizations([]);
        setLoading(false);
        return;
      }

      const orgIds = memberships.map(m => m.organization_id);
      const { data: orgs, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);

      if (orgError || !orgs) {
        setOrganization(null);
        setMembership(null);
        setAllOrganizations([]);
        setLoading(false);
        return;
      }

      const allOrgs: OrgWithRole[] = [];
      for (const m of memberships) {
        const org = orgs.find(o => o.id === m.organization_id);
        if (!org) continue;
        allOrgs.push({ organization: org, role: m.role as OrgRole });
      }

      setAllOrganizations(allOrgs);

      // Determine which org to activate.
      const rolePriority = (r: OrgRole) =>
        r === 'owner' ? 0 : r === 'admin' ? 1 : r === 'manager' ? 2 : 3;
      const sortedByRole = [...allOrgs].sort(
        (a, b) => rolePriority(a.role) - rolePriority(b.role)
      );
      const savedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
      const savedOrg = allOrgs.find(o => o.organization.id === savedOrgId);
      const wasChosen = localStorage.getItem(ORG_CHOSEN_KEY) === 'true';
      const bestAdminOrg = sortedByRole.find(o => o.role === 'owner' || o.role === 'admin' || o.role === 'manager');

      let activeOrg: OrgWithRole | undefined;
      if (wasChosen && savedOrg) {
        // Deliberate choice and the org still exists — respect it.
        activeOrg = savedOrg;
      } else if (wasChosen && !savedOrg) {
        // Chosen org is gone (removed as staff, org deleted). Drop the
        // flag and fall back to the default.
        localStorage.removeItem(ORG_CHOSEN_KEY);
        activeOrg = bestAdminOrg ?? sortedByRole[0];
      } else if (savedOrg && (savedOrg.role !== 'member' || !bestAdminOrg)) {
        // Saved but not explicitly chosen — keep it unless it's a member
        // role and a better admin org exists.
        activeOrg = savedOrg;
      } else {
        activeOrg = bestAdminOrg ?? sortedByRole[0];
      }

      if (activeOrg) {
        setOrganization(activeOrg.organization);
        setMembership({
          organization_id: activeOrg.organization.id,
          role: activeOrg.role,
        });
        localStorage.setItem(ACTIVE_ORG_KEY, activeOrg.organization.id);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
      setOrganization(null);
      setMembership(null);
      setAllOrganizations([]);
    } finally {
      resolvedUserIdRef.current = userId;
      setLoading(false);
    }
  }, []);

  // Effect-driven fetch: runs when the React `user` state changes (login, logout).
  const fetchOrganization = useCallback(async () => {
    if (!user) {
      resolvedUserIdRef.current = null;
      setOrganization(null);
      setMembership(null);
      setAllOrganizations([]);
      setLoading(false);
      return;
    }
    return fetchOrgForUser(user.id);
  }, [user, fetchOrgForUser]);

  // Imperative refetch: reads the current user from supabase.auth.getSession()
  // instead of from the React closure. This works even when called during
  // signup before React has re-rendered with the new auth state.
  const refetch = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const sessionUser = session?.user;
    if (!sessionUser) return;
    return fetchOrgForUser(sessionUser.id);
  }, [fetchOrgForUser]);

  useEffect(() => {
    if (!authLoading) {
      fetchOrganization();
    }
  }, [fetchOrganization, authLoading]);

  const [switching, setSwitching] = useState(false);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchOrganization = useCallback((orgId: string) => {
    const target = allOrganizations.find(o => o.organization.id === orgId);
    if (!target) return;
    // Show the transition overlay immediately
    setSwitching(true);
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    localStorage.setItem(ORG_CHOSEN_KEY, 'true');
    setOrganization(target.organization);
    setMembership({ organization_id: orgId, role: target.role });
    clearSidebarHiddenItemsCache();
    queryClient.clear();
    // Also wipe the persisted localStorage cache so data from the
    // previous org doesn't rehydrate on the next app restart.
    try { localStorage.removeItem('tw-offline-cache'); } catch { /* ignore */ }
    // Dismiss the overlay after queries have had time to start refetching.
    // 600ms covers the round trip for most connections; the skeleton
    // handles anything longer.
    if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    switchTimerRef.current = setTimeout(() => setSwitching(false), 600);
  }, [allOrganizations, queryClient]);

  const isOwner = membership?.role === 'owner';
  // Admin dashboard access: owners, admins, AND managers (invited virtual
  // assistants). Cleaners (role='member') are blocked and sent to /staff.
  const isAdmin =
    membership?.role === 'owner' ||
    membership?.role === 'admin' ||
    membership?.role === 'manager';

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        membership,
        loading: authLoading || loading,
        switching,
        isOwner,
        isAdmin,
        allOrganizations,
        switchOrganization,
        refetch,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
