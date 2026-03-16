import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
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
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [allOrganizations, setAllOrganizations] = useState<OrgWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrganization = useCallback(async () => {
    if (!user) {
      setOrganization(null);
      setMembership(null);
      setAllOrganizations([]);
      setLoading(false);
      return;
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
      const allOrgs: OrgWithRole[] = memberships
        .map(m => {
          const org = orgs.find(o => o.id === m.organization_id);
          if (!org) return null;
          return { organization: org, role: m.role as 'owner' | 'admin' | 'member' };
        })
        .filter((x): x is OrgWithRole => x !== null);

      setAllOrganizations(allOrgs);

      // Determine which org to activate
      const savedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
      let activeOrg = allOrgs.find(o => o.organization.id === savedOrgId);
      if (!activeOrg) activeOrg = allOrgs[0];

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
    // Force a full page reload to reset all cached queries
    window.location.reload();
  }, [allOrganizations]);

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
