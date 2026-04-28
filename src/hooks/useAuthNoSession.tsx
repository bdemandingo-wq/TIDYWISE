/**
 * AUTH HOOK (single source of truth for Supabase auth)
 *
 * Despite the legacy "NoSession" name, sessions ARE persisted across browser
 * restarts so mobile apps and web users stay signed in. Renaming would require
 * touching dozens of import sites; this header documents the actual behavior
 * to remove confusion. See `useAuth.tsx` for the higher-level wrapper that
 * also tracks subscription state.
 *
 * Google & Apple OAuth use Lovable Cloud managed auth (in-app, no external
 * browser).
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { lovable } from '@/integrations/lovable/index';
import { Capacitor } from '@capacitor/core';
import { signInWithOAuthNative } from '@/lib/nativeOAuth';

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
  signInWithApple: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkExistingProfile: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProviderNoSession({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialCleanupDone, setInitialCleanupDone] = useState(false);
  const initRef = useRef(false);

  /**
   * Initialize auth - check for existing session (sessions now persist)
   */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initializeAuth = async () => {
      try {
        // Check for existing session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
        } else {
          // No cached session — try refreshing in case token is expired but refresh token is valid
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData?.session) {
            setSession(refreshData.session);
            setUser(refreshData.session.user);
          }
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        setInitialCleanupDone(true);
        setLoading(false);
      }
    };

    initializeAuth();
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
   * Google OAuth:
   * - Native: uses Supabase + @capacitor/browser (in-app SFSafariViewController) for Guideline 4.0
   * - Web: uses Lovable Cloud managed auth
   */
  const signInWithGoogle = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        return await signInWithOAuthNative('google');
      }
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        return { error: result.error instanceof Error ? result.error : new Error(String(result.error)) };
      }
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  /**
   * Apple Sign In:
   * - Native: uses Supabase + @capacitor/browser (in-app SFSafariViewController) for Guideline 4.0
   * - Web: uses Lovable Cloud managed auth
   */
  const signInWithApple = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        return await signInWithOAuthNative('apple');
      }
      const result = await lovable.auth.signInWithOAuth('apple', {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        return { error: result.error instanceof Error ? result.error : new Error(String(result.error)) };
      }
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }, []);

  /**
   * Check if a profile already exists for this user
   * Used to block Google/Apple OAuth "sign-in" attempts on signup page
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
    try {
      await supabaseNoSession.auth.signOut();
    } catch {
      // Always continue; we still want to wipe local state.
    }
    setUser(null);
    setSession(null);

    // Clear any residual storage (web)
    try {
      const authKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('sb-') || key.includes('supabase')
      );
      authKeys.forEach(key => localStorage.removeItem(key));
    } catch {
      // Ignore storage errors
    }

    // Clear Capacitor Preferences storage (native)
    if (Capacitor.isNativePlatform()) {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { keys } = await Preferences.keys();
        for (const key of keys) {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            await Preferences.remove({ key });
          }
        }
      } catch {
        // Preferences may not be available
      }
    }

    // Hard-redirect on web to wipe React Query cache + any in-memory state.
    // On native we can't do a real redirect, so the SIGNED_OUT auth event
    // plus state reset above is sufficient.
    if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
      window.location.href = '/login';
    }
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
      signInWithApple,
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
