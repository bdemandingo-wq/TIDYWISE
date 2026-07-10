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
  // 'admin' is a legacy value; treat any leftover admin the same as manager.
  const isManager = role === 'manager' || role === 'admin';
  const isOperator = isOwner || isManager;
  // Financial data (payroll, expenses, finance, reports, subscription,
  // pay rates) is owner-only. Managers are blocked.
  const hasFinancialAccess = isOwner;
  // Owner-only capabilities: billing/subscription mgmt, team invites, role changes.
  const canManageBilling = isOwner;
  const canManageTeam = isOwner;

  return {
    role,
    loading,
    isOwner,
    // Kept for backwards-compatibility with any consumer that checked
    // isAdmin — it now means "owner or manager" (admin surface access).
    isAdmin: isOwner || isManager,
    isManager,
    isOperator,
    hasFinancialAccess,
    canManageBilling,
    canManageTeam,
  };
}

