/**
 * AUTH HOOK - Unified with No-Session System
 * 
 * This hook now uses the no-session auth context as its source of truth.
 * Session persistence is disabled - users must login every visit.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useAuthNoSession, supabaseNoSession } from './useAuthNoSession';

interface SubscriptionStatus {
  subscribed: boolean;
  trial_active: boolean;
  trial_end: string | null;
  subscription_end: string | null;
  payment_failed?: boolean;
  message?: string;
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

  const signOut = async () => {
    await noSessionAuth.signOut();
    setSubscription(null);
    setShowSubscriptionDialog(false);
  };

  const checkSubscription = async (accessToken?: string) => {
    try {
      const token =
        accessToken ?? noSessionAuth.session?.access_token;

      if (!token) return;

      const { data, error } = await supabaseNoSession.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      setSubscription(data);
      setShowSubscriptionDialog(!data?.subscribed);
    } catch (error: any) {
      const status = error?.context?.status;
      const msg = String(error?.message ?? "");

      // If the stored session is stale/invalid, clear it so the app can recover.
      if (
        status === 401 ||
        msg.includes("Auth session missing") ||
        msg.includes("session_not_found")
      ) {
        await signOut();
        return;
      }

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
      const { data, error } = await supabaseNoSession.auth.getUser();
      if (error || !data?.user) {
        await signOut();
        return;
      }

      await checkSubscription(noSessionAuth.session?.access_token);
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
