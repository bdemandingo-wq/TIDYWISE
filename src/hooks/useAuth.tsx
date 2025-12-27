import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setSubscription(null);
    setShowSubscriptionDialog(false);
  };

  const checkSubscription = async (accessToken?: string) => {
    try {
      const token =
        accessToken ??
        (await supabase.auth.getSession()).data.session?.access_token;

      if (!token) return;

      const { data, error } = await supabase.functions.invoke("check-subscription", {
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
    let mounted = true;

    // Listen for auth changes (sync only)
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Get initial session AFTER listener is set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      authSub.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setSubscription(null);
      setShowSubscriptionDialog(false);
      return;
    }

    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        await signOut();
        return;
      }

      await checkSubscription(session.access_token);
    }, 0);

    return () => window.clearTimeout(t);
  }, [session?.access_token]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
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
