import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useOrgRole } from '@/hooks/useOrgRole';

/**
 * Gates a route to owner + admin only. Managers are redirected to the dashboard.
 * Use for financial pages: subscription, invoices totals, payroll amounts, reports money.
 */
export function FinancialRoute({ children }: { children: ReactNode }) {
  const { loading, hasFinancialAccess } = useOrgRole();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasFinancialAccess) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
