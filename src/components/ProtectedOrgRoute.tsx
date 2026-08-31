import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Loader2 } from 'lucide-react';

interface ProtectedOrgRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedOrgRoute({ children, requireAdmin = false }: ProtectedOrgRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { organization, loading: orgLoading, resolution, isAdmin, refetch } = useOrganization();

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in - redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but no organization - redirect to onboarding
  if (!organization) {
    if (resolution === 'empty') return <Navigate to="/onboarding" replace />;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">Workspace access could not be verified.</p>
        <button type="button" className="text-sm font-medium text-primary underline" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
