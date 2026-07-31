import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

// Routes that are considered "root" tabs — back button should not navigate away from these
const ROOT_ROUTES = [
  '/dashboard',
  '/login',
  '/signup',
  '/auth',
  '/',
];

function isRootRoute(path: string): boolean {
  // Exact match for root routes
  if (ROOT_ROUTES.includes(path)) return true;
  // /dashboard with no sub-path is root
  if (path === '/dashboard' || path === '/dashboard/') return true;
  return false;
}

function isAuthRoute(path: string): boolean {
  return path === '/login' || path === '/signup' || path === '/auth' || path === '/logout';
}

/**
 * Routes that belong to the signed-in app. The back-button interceptor below
 * exists for these and ONLY these.
 *
 * Everything else — the marketing site, pricing, the comparison and feature
 * pages, the blog, the public booking form, the client portal login — is a
 * normal web page where the browser's own back button is correct and must not
 * be touched.
 */
function isInAppRoute(path: string): boolean {
  return (
    path === '/dashboard' || path.startsWith('/dashboard/') ||
    path === '/staff' || path.startsWith('/staff/') ||
    path.startsWith('/portal/')   // NOT bare /portal, which is the public login
  );
}

/**
 * Determine the parent route for in-app back navigation.
 * Returns null if already at a root route (should stay / minimize).
 */
function getParentRoute(path: string): string | null {
  // Already at root
  if (isRootRoute(path)) return null;

  // Dashboard sub-pages → go to /dashboard
  if (path.startsWith('/dashboard/')) {
    return '/dashboard';
  }

  // Staff sub-pages → go to /staff
  if (path.startsWith('/staff/')) {
    return '/staff';
  }

  // Portal sub-pages → go to /portal/dashboard
  if (path.startsWith('/portal/') && path !== '/portal/dashboard') {
    return '/portal/dashboard';
  }

  // Blog sub-pages → go to /blog
  if (path.startsWith('/blog/')) {
    return '/blog';
  }

  return '/dashboard';
}

export function useAppStateHandler() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      // --- Web: intercept popstate to prevent logout on back ---
      //
      // SCOPE, and why it is this narrow (2026-07-31):
      //
      // This handler used to run on EVERY page for EVERY visitor. Because
      // getParentRoute() falls through to '/dashboard' for any path not
      // explicitly listed, and ROOT_ROUTES contains only five entries, pressing
      // browser Back on any marketing page ran
      //   window.location.replace('/dashboard')
      // which for a signed-out visitor lands on /login. Measured with Playwright
      // on 2026-07-31: back from /pricing, /compare/jobber, /features/booking,
      // /blog and /portal ALL produced a login screen. Every visitor who backed
      // out of a marketing page hit a login wall.
      //
      // The handler's actual purpose is in-app back behaviour for a signed-in
      // user. So it now installs only when BOTH are true: there is a session,
      // and we are on an in-app route. On the public site the browser's own back
      // button is correct and is left alone.
      let ignoreNextPop = false;
      let cancelled = false;
      let cleanupPop: (() => void) | undefined;

      const handlePopState = (e: PopStateEvent) => {
        if (ignoreNextPop) {
          ignoreNextPop = false;
          return;
        }

        const currentPath = window.location.pathname;

        // Left the app since the listener was installed (signed out, or
        // navigated to the marketing site). Stop interfering.
        if (!isInAppRoute(currentPath)) return;

        // Never allow back to navigate to auth routes — block it
        if (isAuthRoute(currentPath)) {
          // We landed on an auth route via back — push forward again
          window.history.pushState({ appGuard: true }, '', '/dashboard');
          window.location.replace('/dashboard');
          return;
        }

        // If at a root route, just re-push state (stay put)
        if (isRootRoute(currentPath)) {
          window.history.pushState({ appGuard: true }, '', window.location.href);
          return;
        }

        // Navigate to parent route
        const parent = getParentRoute(currentPath);
        if (parent) {
          ignoreNextPop = true;
          window.history.pushState({ appGuard: true }, '', parent);
          // Use replace to actually navigate the React router
          window.location.replace(parent);
        } else {
          window.history.pushState({ appGuard: true }, '', window.location.href);
        }
      };

      // Install only for a signed-in user who is inside the app. Both checks
      // matter: the session alone would still hijack Back for a logged-in user
      // reading the blog, and the route alone would hijack it for a signed-out
      // visitor on /portal/... .
      //
      // The session lookup is async, so guard against the effect being torn
      // down while it is in flight — otherwise a fast unmount leaves a listener
      // attached with no way to remove it.
      void (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) return;
        if (!isInAppRoute(window.location.pathname)) return;

        // Push a state so there is always something in the stack to pop.
        // Deliberately inside the guard: doing this unconditionally added a
        // phantom history entry to every marketing page, so the first Back
        // press appeared to do nothing.
        window.history.pushState({ appGuard: true }, '', window.location.href);
        window.addEventListener('popstate', handlePopState);
        cleanupPop = () => window.removeEventListener('popstate', handlePopState);
      })();

      return () => {
        cancelled = true;
        cleanupPop?.();
      };
    }

    // --- Native Capacitor ---
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { App } = await import('@capacitor/app');

      const resumeListener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          // Data was going stale on the phone: with refetchOnWindowFocus off
          // and a 5-min staleTime, changes made elsewhere (admin approving a
          // cleaner's document, a cleaner uploading booking photos) never
          // showed up until a manual reload. Refresh everything on resume.
          queryClient.invalidateQueries();
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const expiresAt = session.expires_at ?? 0;
              const expiresInSec = expiresAt - Math.floor(Date.now() / 1000);
              if (expiresInSec < 300) {
                await supabase.auth.refreshSession();
              }
            }
          } catch {
            // Non-fatal
          }
        }
      });

      const backListener = await App.addListener('backButton', ({ canGoBack }) => {
        const currentPath = window.location.hash.replace('#', '') || '/';

        // Never go back to auth routes
        if (isAuthRoute(currentPath)) {
          window.location.hash = '#/dashboard';
          return;
        }

        // At root → minimize app instead of exiting
        if (isRootRoute(currentPath)) {
          App.minimizeApp();
          return;
        }

        // Navigate to parent route within the app
        const parent = getParentRoute(currentPath);
        if (parent) {
          window.location.hash = '#' + parent;
        } else if (canGoBack) {
          window.history.back();
        } else {
          App.minimizeApp();
        }
      });

      cleanup = () => {
        resumeListener.remove();
        backListener.remove();
      };
    };

    init().catch(console.error);

    return () => {
      cleanup?.();
    };
  }, []);
}
