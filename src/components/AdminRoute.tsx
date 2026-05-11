import { ReactNode, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: ReactNode;
}

/**
 * AdminRoute - Protects admin dashboard routes
 * 
 * SECURITY: Only allows users with 'owner' or 'admin' role in org_memberships.
 * Staff members (role='member') are redirected to the staff portal.
 * 
 * This prevents cleaners/staff from accidentally or intentionally accessing
 * the admin dashboard even if they have valid authentication.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { organization, membership, loading: orgLoading, isAdmin } = useOrganization();

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
    return <Navigate to="/onboarding" replace />;
  }

  // User is a member but NOT an admin/owner - redirect to staff portal
  // This is the critical security check that prevents staff from accessing admin
  if (membership && !isAdmin) {
    console.warn(
      '[SECURITY] Non-admin user attempted to access admin route',
      { userId: user.id, role: membership.role }
    );
    return <Navigate to="/staff" replace />;
  }

  // Only allow if user is explicitly admin or owner
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
