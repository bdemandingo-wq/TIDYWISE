import { ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
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
  '/logout',
];

const INVITE_JOIN_KEY = 'tidywise_invite_joined_workspace';

function getRecentInviteJoinAttempt(): { attempt_id?: string } | null {
  try {
    const raw = sessionStorage.getItem(INVITE_JOIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { attempt_id?: string; at?: number };
    if (!parsed.at || Date.now() - parsed.at > 10 * 60 * 1000) {
      sessionStorage.removeItem(INVITE_JOIN_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
    (o) => (o.role === 'owner' || o.role === 'admin' || o.role === 'manager') && o.organization.id !== organization?.id
  );

  useEffect(() => {
    if (orgLoading || authLoading) return;
    if (membership && !isAdmin && adminOrgElsewhere && !switchedRef.current) {
      switchedRef.current = true;
      switchOrganization(adminOrgElsewhere.organization.id);
    }
  }, [orgLoading, authLoading, membership, isAdmin, adminOrgElsewhere, switchOrganization]);

  useEffect(() => {
    if (!organization) return;
    try { sessionStorage.removeItem(INVITE_JOIN_KEY); } catch { /* noop */ }
  }, [organization]);

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
    const inviteAttempt = getRecentInviteJoinAttempt();
    if (inviteAttempt) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md space-y-3 rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-card-foreground">Workspace access is still syncing</h1>
            <p className="text-sm text-muted-foreground">
              Your invite was accepted, but the workspace could not be loaded yet. Refresh once; if it continues, share this attempt ID with support.
            </p>
            {inviteAttempt.attempt_id && (
              <p className="break-all rounded-md bg-muted p-2 text-xs text-muted-foreground">attempt_id: {inviteAttempt.attempt_id}</p>
            )}
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Refresh workspace
            </button>
          </div>
        </div>
      );
    }
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
