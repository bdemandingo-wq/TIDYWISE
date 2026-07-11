/**
 * AUTH HOOK - Unified with No-Session System
 * 
 * This hook now uses the no-session auth context as its source of truth.
 * Session persistence is disabled - users must login every visit.
 */

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useAuthNoSession, supabaseNoSession } from './useAuthNoSession';

interface SubscriptionStatus {
  subscribed: boolean;
  trial_active: boolean;
  trial_end: string | null;
  subscription_end: string | null;
  payment_failed?: boolean;
  message?: string;
  product_id?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  subscription: SubscriptionStatus | null;
  checkSubscription: (accessToken?: string) => Promise<void>;
  showSubscriptionDialog: boolean;
  setShowSubscriptionDialog: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use the no-session auth as the source of truth
  const noSessionAuth = useAuthNoSession();
  
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  // Tolerate a single 401 from check-subscription before signing the
  // user out. Supabase auth occasionally returns a transient 401 right
  // after a new user is created via inviteUserByEmail (the checkout-
  // first flow) before the session propagates. Without this, the user
  // landing on /checkout/success would get auto-signed-out by the
  // polling loop and see the anonymous variant of the page.
  const consecutive401sRef = useRef(0);

  const signOut = async () => {
    // Purge per-user/per-org sidebar visibility cache so the next signed-in
    // user (e.g. on a shared device) never inherits stale hidden tabs.
    const { clearSidebarHiddenItemsCache } = await import('@/hooks/useSidebarHiddenItems');
    clearSidebarHiddenItemsCache();
    await noSessionAuth.signOut();
    setSubscription(null);
    setShowSubscriptionDialog(false);
  };

  const checkSubscription = async (accessToken?: string) => {
    try {
      const token =
        accessToken ?? noSessionAuth.session?.access_token;

      if (!token) return;

      // NOTE: The free-account allowlist is enforced server-side in the
      // `check-subscription` edge function (keyed by auth.users.id and email).
      // Do NOT add a client-side bypass here — it would be trivially spoofable.

      const { data, error } = await supabaseNoSession.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      setSubscription(data);
      consecutive401sRef.current = 0;
      // Open the subscription dialog only when:
      //   1. The user genuinely doesn't have a subscription, AND
      //   2. We are NOT in the post-checkout grace window — the
      //      /checkout/success page polls this function several times
      //      right after Stripe redirects, and the webhook can race
      //      that by a second or two. Without the guard, the paywall
      //      dialog flashes open during the polling and creates the
      //      "screen glitching" the user reported.
      if (!data?.subscribed) {
        const inGrace = (() => {
          try {
            return sessionStorage.getItem("tw_post_checkout") === "1";
          } catch { return false; }
        })();
        if (!inGrace) setShowSubscriptionDialog(true);
      } else {
        // Subscription confirmed — exit the grace window if we were in
        // one so a later state change (downgrade, cancel) opens the
        // dialog normally.
        try { sessionStorage.removeItem("tw_post_checkout"); } catch { /* no-op */ }
      }
    } catch (error: any) {
      const status = error?.context?.status;
      const msg = String(error?.message ?? "");

      const looksLikeAuth =
        status === 401 ||
        msg.includes("Auth session missing") ||
        msg.includes("session_not_found");

      // Tolerate a single transient 401 — Supabase auth occasionally
      // returns one right after a new user is created (eg from the
      // checkout-first flow's inviteUserByEmail) before propagation.
      // Two in a row = real auth failure; sign out.
      if (looksLikeAuth) {
        consecutive401sRef.current += 1;
        if (consecutive401sRef.current >= 2) {
          consecutive401sRef.current = 0;
          await signOut();
          return;
        }
        console.warn("[useAuth] transient 401 — tolerating one retry");
        return;
      }
      consecutive401sRef.current = 0;
      // Log but don't block login — subscription check failure should not prevent access
      console.error("Error checking subscription:", error);
    }
  };

  useEffect(() => {
    if (!noSessionAuth.session?.access_token) {
      setSubscription(null);
      setShowSubscriptionDialog(false);
      return;
    }

    const t = window.setTimeout(async () => {
      try {
        const { data, error } = await supabaseNoSession.auth.getUser();
        if (error || !data?.user) {
          // Try refreshing the session before giving up
          const { data: refreshData, error: refreshError } = await supabaseNoSession.auth.refreshSession();
          if (refreshError || !refreshData?.session) {
            await signOut();
            return;
          }
          // Session refreshed successfully, continue
        }
        await checkSubscription(noSessionAuth.session?.access_token);
      } catch {
        // Network error - don't sign out, just skip the check
        console.warn('Network error during auth check, keeping session');
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [noSessionAuth.session?.access_token]);

  return (
    <AuthContext.Provider value={{ 
      user: noSessionAuth.user, 
      session: noSessionAuth.session, 
      loading: noSessionAuth.loading || !noSessionAuth.initialCleanupDone, 
      signOut, 
      subscription, 
      checkSubscription,
      showSubscriptionDialog,
      setShowSubscriptionDialog
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
