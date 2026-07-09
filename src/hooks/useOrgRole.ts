import { useOrganization, type OrgRole } from '@/contexts/OrganizationContext';

/**
 * Role gate helpers for the admin workspace.
 * - owner: everything
 * - admin: everything except billing/subscription
 * - manager: full operations, NO financial data
 * - member: staff-only (not admin surface)
 */
export function useOrgRole() {
  const { membership, loading } = useOrganization();
  const role: OrgRole | null = membership?.role ?? null;

  const isOwner = role === 'owner';
  const isAdmin = role === 'owner' || role === 'admin';
  const isManager = role === 'manager';
  const isOperator = role === 'owner' || role === 'admin' || role === 'manager';
  // Owner + admin see financial data. Managers do not.
  const hasFinancialAccess = role === 'owner' || role === 'admin';
  // Owner-only capabilities: billing/subscription mgmt, team invites, role changes.
  const canManageBilling = role === 'owner';
  const canManageTeam = role === 'owner';

  return {
    role,
    loading,
    isOwner,
    isAdmin,
    isManager,
    isOperator,
    hasFinancialAccess,
    canManageBilling,
    canManageTeam,
  };
}
