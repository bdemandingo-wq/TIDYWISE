/**
 * AUTH HOOK WITH NO SESSION PERSISTENCE
 * 
 * This hook implements mandatory login every visit:
 * - Sessions are NOT persisted across browser restarts or new tabs
 * - On every fresh page load, users are treated as logged out
 * - No localStorage session persistence
 * - Auto-clears any existing sessions on app start
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Re-export for backward compatibility
export const supabaseNoSession = supabase;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialCleanupDone: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, metadata?: { full_name?: string; phone?: string }) => Promise<{ data: { user: User | null } | null; error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkExistingProfile: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProviderNoSession({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialCleanupDone, setInitialCleanupDone] = useState(false);
  const cleanupRef = useRef(false);

  /**
   * CRITICAL: Clear ALL auth state on app start
   * This enforces mandatory login every visit
   */
  useEffect(() => {
    if (cleanupRef.current) return;
    cleanupRef.current = true;

    const clearAuthOnStart = async () => {
      try {
        // Clear any localStorage auth keys that might exist from previous sessions
        const authKeys = Object.keys(localStorage).filter(key => 
          key.startsWith('sb-') || key.includes('supabase')
        );
        authKeys.forEach(key => localStorage.removeItem(key));

        // Clear sessionStorage too
        const sessionKeys = Object.keys(sessionStorage).filter(key => 
          key.startsWith('sb-') || key.includes('supabase')
        );
        sessionKeys.forEach(key => sessionStorage.removeItem(key));

        // Check if we're returning from an OAuth callback
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        const hasAuthCallback = hashParams.has('access_token') || queryParams.has('code');

        if (!hasAuthCallback) {
          // Not an OAuth callback - clear any existing session
          await supabaseNoSession.auth.signOut();
          setUser(null);
          setSession(null);
        }
      } catch (err) {
        console.error('Error clearing auth on start:', err);
      } finally {
        setInitialCleanupDone(true);
        setLoading(false);
      }
    };

    clearAuthOnStart();
  }, []);

  // Listen for auth state changes AFTER initial cleanup
  useEffect(() => {
    if (!initialCleanupDone) return;

    const { data: { subscription } } = supabaseNoSession.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        // If user signs out, ensure state is cleared
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
        }
      }
    );

    // Check current session (for OAuth callbacks)
    supabaseNoSession.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [initialCleanupDone]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabaseNoSession.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  const signUp = useCallback(async (
    email: string, 
    password: string, 
    metadata?: { full_name?: string; phone?: string }
  ) => {
    try {
      const { data, error } = await supabaseNoSession.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
          emailRedirectTo: `${window.location.origin}/signup`,
        },
      });
      return { data, error };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  }, []);

  /**
   * Google OAuth for SIGN-UP ONLY
   * After OAuth callback, we check if user already exists (has profile)
   * If they do, we sign them out and block access
   */
  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabaseNoSession.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/signup?oauth=google`,
        },
      });
      return { error };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  /**
   * Check if a profile already exists for this user
   * Used to block Google OAuth "sign-in" attempts
   */
  const checkExistingProfile = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabaseNoSession
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking profile:', error);
        return false;
      }
      
      return !!data;
    } catch (err) {
      console.error('Error checking profile:', err);
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabaseNoSession.auth.signOut();
    setUser(null);
    setSession(null);
    
    // Clear any residual storage
    const authKeys = Object.keys(localStorage).filter(key => 
      key.startsWith('sb-') || key.includes('supabase')
    );
    authKeys.forEach(key => localStorage.removeItem(key));
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      initialCleanupDone,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      checkExistingProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthNoSession() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthNoSession must be used within an AuthProviderNoSession');
  }
  return context;
}
// supabaseNoSession is already exported above via re-export from @/lib/supabase
