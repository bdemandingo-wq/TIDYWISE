import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  owner_id: string;
}

interface OrganizationMembership {
  organization_id: string;
  role: 'owner' | 'admin' | 'member';
}

interface OrgWithRole {
  organization: Organization;
  role: 'owner' | 'admin' | 'member';
}

interface OrganizationContextType {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  /** All organizations the current user belongs to */
  allOrganizations: OrgWithRole[];
  /** Switch the active organization */
  switchOrganization: (orgId: string) => void;
  refetch: () => Promise<void>;
}

const ACTIVE_ORG_KEY = 'tidywise_active_org';

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

  const fetchOrganization = useCallback(async () => {
    if (!user) {
      resolvedUserIdRef.current = null;
      setOrganization(null);
      setMembership(null);
      setAllOrganizations([]);
      setLoading(false);
      return;
    }

    if (resolvedUserIdRef.current !== user.id) {
      setLoading(true);
    }

    try {
      // Fetch ALL memberships for this user
      const { data: memberships, error: membershipError } = await supabase
        .from('org_memberships')
        .select('organization_id, role')
        .eq('user_id', user.id);

      if (membershipError || !memberships || memberships.length === 0) {
        setOrganization(null);
        setMembership(null);
        setAllOrganizations([]);
        setLoading(false);
        return;
      }

      // Fetch all related organizations
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

      // Build the full list
      const allOrgs: OrgWithRole[] = [];
      for (const m of memberships) {
        const org = orgs.find(o => o.id === m.organization_id);
        if (!org) continue;
        allOrgs.push({ organization: org, role: m.role as 'owner' | 'admin' | 'member' });
      }

      setAllOrganizations(allOrgs);

      // Determine which org to activate.
      // SECURITY/UX: Always prefer an owner/admin membership when one exists so
      // users with elevated access in any organization land in the admin
      // dashboard instead of being bounced to the staff portal. If a saved org
      // is a member-only role but the user has admin access elsewhere, the
      // admin org wins. Explicit switches via switchOrganization still persist.
      const rolePriority = (r: 'owner' | 'admin' | 'member') =>
        r === 'owner' ? 0 : r === 'admin' ? 1 : 2;
      const sortedByRole = [...allOrgs].sort(
        (a, b) => rolePriority(a.role) - rolePriority(b.role)
      );
      const savedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
      const savedOrg = allOrgs.find(o => o.organization.id === savedOrgId);
      const bestAdminOrg = sortedByRole.find(o => o.role === 'owner' || o.role === 'admin');
      let activeOrg: OrgWithRole | undefined;
      if (savedOrg && (savedOrg.role !== 'member' || !bestAdminOrg)) {
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
      resolvedUserIdRef.current = user.id;
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchOrganization();
    }
  }, [fetchOrganization, authLoading]);

  const switchOrganization = useCallback((orgId: string) => {
    const target = allOrganizations.find(o => o.organization.id === orgId);
    if (!target) return;
    localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    setOrganization(target.organization);
    setMembership({ organization_id: orgId, role: target.role });
    // Reset cached React Query data so org-scoped queries refetch
    // against the new org. Previously this called window.location.reload(),
    // which threw away scroll position, in-progress forms, and looked
    // like the dashboard was "glitching" mid-onboarding (the brief
    // dashboard paint → hard refresh sequence was a major contributor
    // to the user-reported glitch).
    queryClient.clear();
  }, [allOrganizations, queryClient]);

  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin';

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        membership,
        loading: authLoading || loading,
        isOwner,
        isAdmin,
        allOrganizations,
        switchOrganization,
        refetch: fetchOrganization,
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
