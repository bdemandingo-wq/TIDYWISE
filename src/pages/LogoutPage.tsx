/**
 * LOGOUT PAGE
 * 
 * Clears all auth state and redirects to login
 * This is a dedicated route for clean logout handling
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthNoSession } from '@/hooks/useAuthNoSession';
import { clearSidebarHiddenItemsCache } from '@/hooks/useSidebarHiddenItems';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';

export default function LogoutPage() {
  const navigate = useNavigate();
  const { signOut } = useAuthNoSession();

  useEffect(() => {
    /*
      Navigate FIRST, then clean up.

      This used to `await signOut()` — a network round-trip to the auth server —
      before it ever called navigate(), so a slow or offline connection left the
      user staring at the "Signing out..." spinner for seconds, and a failed
      request meant the redirect only happened via the finally block. Logging
      out is a UI intent: the user should be on /login immediately.

      The storage purge is what actually ends the session on this device, and it
      is synchronous, so it runs before the redirect. The server-side revoke is
      fire-and-forget afterwards.
    */
    const purgeLocalSession = () => {
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('sb-') || key.includes('supabase'))
          .forEach((key) => localStorage.removeItem(key));
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith('sb-') || key.includes('supabase'))
          .forEach((key) => sessionStorage.removeItem(key));
        // Purge per-user/per-org sidebar visibility cache so the next
        // user on this device does not inherit stale hidden tabs.
        clearSidebarHiddenItemsCache();
      } catch (err) {
        console.error('Logout storage purge failed:', err);
      }
    };

    purgeLocalSession();
    navigate('/login', { replace: true });

    // Background: revoke the session server-side, then purge again in case the
    // client wrote a fresh token while the request was in flight.
    void Promise.resolve(signOut())
      .catch((err) => console.error('Logout error:', err))
      .finally(purgeLocalSession);
  }, [signOut, navigate]);

  return (
    <>
      <SEOHead
        title="Logging Out | TidyWise"
        description="Signing you out of TidyWise and clearing your session — you'll be redirected to the login page in a moment."
        noIndex
      />
      <div className="min-h-screen flex items-center justify-center bg-background">
        <h1 className="sr-only">Signing out of TidyWise</h1>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Signing out...</p>
        </div>
      </div>
    </>
  );
}
