import { useEffect, useRef, useCallback } from 'react';
import { useClientPortal } from '@/contexts/ClientPortalContext';

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes of inactivity = idle
const UPDATE_INTERVAL_MS = 30 * 1000; // Update session every 30 seconds

export function useClientPortalSessionTracker() {
  const { user, customer, sessionToken, invokePortal } = useClientPortal();
  const sessionIdRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const activeTimeRef = useRef<number>(0);

  // Reset activity timer on user interaction
  const handleActivity = useCallback(() => {
    const now = Date.now();
    
    // If we were idle, don't count the idle time
    if (!isIdleRef.current) {
      activeTimeRef.current += now - lastActivityRef.current;
    }
    
    lastActivityRef.current = now;
    isIdleRef.current = false;
  }, []);

  // Check for idle state
  const checkIdle = useCallback(() => {
    const now = Date.now();
    const timeSinceActivity = now - lastActivityRef.current;
    
    if (timeSinceActivity >= IDLE_TIMEOUT_MS && !isIdleRef.current) {
      isIdleRef.current = true;
    }
  }, []);

  // Create a new session
  const createSession = useCallback(async () => {
    if (!user || !customer || !sessionToken) return;
    
    try {
      console.log('[CLIENT_PORTAL_SESSION] createSession start', { userId: user.id });
      const { data, error, unauthorized } = await invokePortal<{ id?: string }>('client-portal-session-track', {
        body: { action: 'create' },
      });

      if (unauthorized) return;
      if (error) throw error;
      const sessionId = (data as { id?: string } | null)?.id;
      if (!sessionId) throw new Error('Session id missing');
      sessionIdRef.current = sessionId;
      console.log('[CLIENT_PORTAL_SESSION] createSession success', { sessionId });
      sessionStartRef.current = Date.now();
      activeTimeRef.current = 0;
      lastActivityRef.current = Date.now();
    } catch (err) {
      console.error('[CLIENT_PORTAL_SESSION] createSession failed', err);
    }
  }, [user, customer, sessionToken, invokePortal]);

  // Update session duration
  const updateSession = useCallback(async () => {
    if (!sessionIdRef.current || !user || !sessionToken) return;
    
    // Check for idle before updating
    checkIdle();
    
    // Only count active time
    if (!isIdleRef.current) {
      const now = Date.now();
      activeTimeRef.current += now - lastActivityRef.current;
      lastActivityRef.current = now;
    }
    
    const durationSeconds = Math.floor(activeTimeRef.current / 1000);
    
    try {
      const { error, unauthorized } = await invokePortal('client-portal-session-track', {
        body: {
          action: 'update',
          session_id: sessionIdRef.current,
          duration_seconds: durationSeconds,
        },
      });

      if (unauthorized) return;
      if (error) throw error;
    } catch (err) {
      console.error('[CLIENT_PORTAL_SESSION] updateSession failed', err);
    }
  }, [user, sessionToken, checkIdle, invokePortal]);

  // End the session
  const endSession = useCallback(async () => {
    if (!sessionIdRef.current || !sessionToken) return;
    
    // Final activity check
    if (!isIdleRef.current) {
      const now = Date.now();
      activeTimeRef.current += now - lastActivityRef.current;
    }
    
    const durationSeconds = Math.floor(activeTimeRef.current / 1000);
    
    try {
      const { error, unauthorized } = await invokePortal('client-portal-session-track', {
        body: {
          action: 'end',
          session_id: sessionIdRef.current,
          duration_seconds: durationSeconds,
        },
      });

      if (unauthorized) return;
      if (error) throw error;
    } catch (err) {
      console.error('[CLIENT_PORTAL_SESSION] endSession failed', err);
    }
    
    sessionIdRef.current = null;
  }, [sessionToken, invokePortal]);

  useEffect(() => {
    if (!user || !customer || !sessionToken) return;
    console.log('[CLIENT_PORTAL_SESSION] init', { userId: user.id });

    // Start session
    createSession();

    // Activity event listeners
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isIdleRef.current = true;
        updateSession();
      } else {
        handleActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Update interval
    const updateInterval = setInterval(updateSession, UPDATE_INTERVAL_MS);

    // Idle check interval
    const idleCheckInterval = setInterval(checkIdle, 10000);

    // Cleanup on unmount or user change
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(updateInterval);
      clearInterval(idleCheckInterval);
      endSession();
    };
  }, [user, customer, createSession, handleActivity, updateSession, endSession, checkIdle]);

  // Handle page unload - use fetch with keepalive
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (sessionIdRef.current && sessionToken) {
        const durationSeconds = Math.floor(activeTimeRef.current / 1000);
        
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-portal-session-track`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                'x-portal-session': sessionToken,
              },
              body: JSON.stringify({
                action: 'end',
                session_id: sessionIdRef.current,
                duration_seconds: durationSeconds,
              }),
              keepalive: true,
            }
          );
        } catch {
          // Silently fail on unload
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionToken]);
}
