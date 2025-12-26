import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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

interface OrganizationContextType {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrganization = async () => {
    if (!user) {
      setOrganization(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    try {
      // First get the user's membership
      const { data: membershipData, error: membershipError } = await supabase
        .from('org_memberships')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membershipData) {
        setOrganization(null);
        setMembership(null);
        setLoading(false);
        return;
      }

      setMembership({
        organization_id: membershipData.organization_id,
        role: membershipData.role as 'owner' | 'admin' | 'member',
      });

      // Then get the organization details
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', membershipData.organization_id)
        .single();

      if (orgError || !orgData) {
        setOrganization(null);
        setLoading(false);
        return;
      }

      setOrganization(orgData);
    } catch (error) {
      console.error('Error fetching organization:', error);
      setOrganization(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchOrganization();
    }
  }, [user, authLoading]);

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
