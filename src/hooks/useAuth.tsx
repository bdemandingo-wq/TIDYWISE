import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionStatus {
  subscribed: boolean;
  trial_active: boolean;
  trial_end: string | null;
  subscription_end: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  subscription: SubscriptionStatus | null;
  checkSubscription: () => Promise<void>;
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

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setSubscription(data);
      
      // If not subscribed, show dialog
      if (!data?.subscribed) {
        setShowSubscriptionDialog(true);
      } else {
        setShowSubscriptionDialog(false);
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Check subscription when session exists
      if (session?.user) {
        checkSubscription();
      }
    });

    // Listen for auth changes
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Check subscription on login
        if (_event === 'SIGNED_IN' && session?.user) {
          checkSubscription();
        }
      }
    );

    return () => authSub.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSubscription(null);
    setShowSubscriptionDialog(false);
  };

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
