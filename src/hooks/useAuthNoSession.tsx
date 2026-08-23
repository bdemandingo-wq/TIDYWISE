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
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { lovable } from '@/integrations/lovable/index';
import { Capacitor } from '@capacitor/core';
import { signInWithOAuthNative } from '@/lib/nativeOAuth';
import { Sentry } from '@/lib/sentry';

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
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialCleanupDone, setInitialCleanupDone] = useState(false);
  const initRef = useRef(false);
  // Track which user the cache belongs to so we only clear on identity change.
  const cachedUserIdRef = useRef<string | null>(null);

  /**
   * Initialize auth - check for existing session (sessions now persist)
   */
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initializeAuth = async () => {
      try {
        // getSession() already refreshes an expired token from a valid
        // refresh token — that is what supabase-js does internally on
        // recovery. There used to be a manual refreshSession() in the else
        // branch here as a belt-and-braces fallback. It was neither: with
        // autoRefreshToken:true and a second manual refresh in useAuth, the
        // same refresh token could be presented three times, and Supabase
        // treats a reused refresh token as theft and revokes the whole token
        // family. That is how one account accumulated 111 refresh tokens and
        // 29 sessions, being logged out each time a family was revoked.
        // One refresher. Do not add another.
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
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
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // If user signs out, ensure state is cleared
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          cachedUserIdRef.current = null;
          queryClient.clear();
        }

        // Clear the cache when a different user signs in — prevents the
        // previous user's data from rendering under the new user's session.
        if (event === 'SIGNED_IN' && currentSession?.user) {
          const newUserId = currentSession.user.id;
          if (cachedUserIdRef.current && cachedUserIdRef.current !== newUserId) {
            queryClient.clear();
          }
          cachedUserIdRef.current = newUserId;
        }

        // OAuth signup: when a user signs in via Apple/Google for the first
        // time, they have no profile or org. The email/password path handles
        // this in the signup handler, but OAuth lands here directly.
        // Provision a trial org if this user has no org_memberships yet.
        if (event === 'SIGNED_IN' && currentSession?.user) {
          try {
            const { data: memberships } = await supabaseNoSession
              .from('org_memberships')
              .select('organization_id')
              .eq('user_id', currentSession.user.id)
              .limit(1);

            if (!memberships || memberships.length === 0) {
              const { data } = await supabaseNoSession.functions.invoke('provision-trial-org');
              const orgId = (data as { organization_id?: string })?.organization_id;
              if (orgId) {
                try { localStorage.setItem('tidywise_active_org', orgId); } catch { /* ignore */ }
              }
            }
          } catch {
            // Non-blocking — org can be provisioned on next login
          }
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

  // Tag Sentry events with the authenticated user so production errors
  // can be traced to a specific account. Clears on sign-out. Reacts to
  // any `user` change, so we don't need to thread setUser through every
  // sign-in / sign-out / token-refresh code path.
  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email ?? undefined });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

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
  ): Promise<{ data: { user: User | null } | null; error: Error | null }> => {
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
      // scope: 'local' — end only this device's session. The SDK default
      // (scope: 'global', i.e. no scope argument) revokes EVERY active
      // session for the account everywhere, which meant clicking Logout
      // on one device silently signed the user out of their phone and
      // any other open tab/browser too (confirmed live, 2026-07-14 — see
      // tests/logout-check.spec.ts). No evidence this was intentional:
      // there's no separate "sign out everywhere" feature anywhere in the
      // app, and ForgotPasswordPage's own copy states the opposite
      // expectation ("All other active sessions on other devices stay
      // signed in unless you sign them out from settings" — a settings
      // feature that doesn't actually exist yet). If a deliberate
      // "sign out everywhere" action is ever added, give IT the global
      // scope explicitly rather than making it Logout's default.
      await supabaseNoSession.auth.signOut({ scope: "local" });
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
