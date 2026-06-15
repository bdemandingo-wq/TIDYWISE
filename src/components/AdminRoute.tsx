import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2 } from 'lucide-react';

interface AdminRouteProps {
  children: ReactNode;
}

// Routes a non-active org owner is still allowed to reach so they can
// pay / log out / view billing. Everything else bounces to /pricing.
const PAYWALL_ALLOWED_PATHS = [
  '/dashboard/subscription',
  '/dashboard/settings',
  '/logout',
];



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
  const { user, loading: authLoading, subscription } = useAuth();
  const { organization, membership, loading: orgLoading, isAdmin, allOrganizations, switchOrganization } = useOrganization();
  const { hasFullAccess, isLoading: subLoading } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();

  const switchedRef = useRef(false);
  // One-shot paywall redirect guard. Without this, AdminRoute returns a
  // fresh <Navigate to="/pricing"> on every re-render — and re-renders
  // happen often (subscription poll, org refetch, queryClient changes).
  // Each render fires a navigation call; Chrome's "Throttling navigation"
  // protection kicks in around 30 nav/5s and freezes the tab on a black
  // screen. Imperative navigate() inside useEffect fires once per
  // distinct redirect decision and never floods.
  const paywallRedirectRef = useRef<string | null>(null);


  // If the active org isn't admin/owner but the user IS admin/owner in another
  // org, transparently switch to that org instead of bouncing to /staff. This
  // protects users who accidentally have a member-role membership somewhere.
  const adminOrgElsewhere = allOrganizations.find(
    (o) => (o.role === 'owner' || o.role === 'admin') && o.organization.id !== organization?.id
  );

  useEffect(() => {
    if (orgLoading || authLoading) return;
    if (membership && !isAdmin && adminOrgElsewhere && !switchedRef.current) {
      switchedRef.current = true;
      switchOrganization(adminOrgElsewhere.organization.id);
    }
  }, [orgLoading, authLoading, membership, isAdmin, adminOrgElsewhere, switchOrganization]);

  // ── PAYWALL GATE ────────────────────────────────────────────────────────
  // Compute BEFORE any early returns so hook order stays stable across
  // renders (otherwise React error #310 — hooks called conditionally).
  const needsPaywallRedirect =
    !!user &&
    !!organization &&
    isAdmin &&
    !Capacitor.isNativePlatform() &&
    !subLoading &&
    !hasFullAccess &&
    !PAYWALL_ALLOWED_PATHS.some(
      (allowed) => location.pathname === allowed || location.pathname.startsWith(allowed + '/')
    );

  // Imperative one-shot redirect, keyed on pathname.
  useEffect(() => {
    if (!needsPaywallRedirect) return;
    if (paywallRedirectRef.current === location.pathname) return;
    paywallRedirectRef.current = location.pathname;
    navigate('/pricing', { replace: true, state: { from: location.pathname } });
  }, [needsPaywallRedirect, location.pathname, navigate]);

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

  // Wait for the auto-switch above to take effect before deciding to bounce.
  if (membership && !isAdmin && adminOrgElsewhere) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // User is a member but NOT an admin/owner anywhere - send to staff portal
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

  if (needsPaywallRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
