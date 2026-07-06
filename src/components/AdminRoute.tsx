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
  //
  // Post-checkout grace window: when the user just completed Stripe
  // Checkout, `tw_post_checkout` is set for ~2 minutes. During that
  // window we suppress the paywall redirect entirely because the
  // webhook (which flips plan_type → 'lifetime' / inserts the
  // subscription row) can race the redirect by several seconds. Without
  // this guard, lifetime buyers land on /dashboard and get bounced
  // straight back to /pricing before check-subscription has caught up
  // — exactly the complaint in the forwarded support email.
  const inPostCheckoutGrace = (() => {
    try {
      return typeof window !== 'undefined' &&
        window.sessionStorage?.getItem('tw_post_checkout') === '1';
    } catch { return false; }
  })();

  const needsPaywallRedirect =
    !!user &&
    !!organization &&
    isAdmin &&
    !Capacitor.isNativePlatform() &&
    !subLoading &&
    !hasFullAccess &&
    !inPostCheckoutGrace &&
    !PAYWALL_ALLOWED_PATHS.some(
      (allowed) => location.pathname === allowed || location.pathname.startsWith(allowed + '/')
    );

  // Existing customers (had a Stripe sub before, card expired, or payment failed)
  // should go to /dashboard/subscription so they can update their card in one
  // click. Brand-new users with no billing history go to /pricing to choose a plan.
  const isExistingCustomer =
    !!subscription?.payment_failed ||
    !!subscription?.subscription_end ||
    (!!subscription?.product_id && subscription.product_id !== 'org_trial');

  const paywallDestination = isExistingCustomer ? '/dashboard/subscription' : '/choose-plan';

  // Imperative one-shot redirect, keyed on pathname.
  useEffect(() => {
    if (!needsPaywallRedirect) return;
    if (paywallRedirectRef.current === location.pathname) return;
    paywallRedirectRef.current = location.pathname;
    navigate(paywallDestination, { replace: true, state: { from: location.pathname } });
  }, [needsPaywallRedirect, location.pathname, navigate, paywallDestination]);


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
