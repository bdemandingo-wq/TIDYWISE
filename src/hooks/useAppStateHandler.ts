import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

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
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      // --- Mobile Web: intercept popstate to prevent logout on back ---
      let ignoreNextPop = false;

      // Push an initial state so there's always something in the stack
      window.history.pushState({ appGuard: true }, '', window.location.href);

      const handlePopState = (e: PopStateEvent) => {
        if (ignoreNextPop) {
          ignoreNextPop = false;
          return;
        }

        const currentPath = window.location.pathname;

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

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }

    // --- Native Capacitor ---
    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { App } = await import('@capacitor/app');

      const resumeListener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
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
