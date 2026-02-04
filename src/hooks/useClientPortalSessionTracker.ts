import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useClientPortal } from '@/contexts/ClientPortalContext';

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes of inactivity = idle
const UPDATE_INTERVAL_MS = 30 * 1000; // Update session every 30 seconds

export function useClientPortalSessionTracker() {
  const { user, customer } = useClientPortal();
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
    if (!user || !customer) return;
    
    try {
      console.log('[CLIENT_PORTAL_SESSION] createSession start', { userId: user.id, email: customer.email });
      const { data, error } = await supabase
        .from('client_portal_sessions')
        .insert({
          client_user_id: user.id,
          customer_email: customer.email,
          organization_id: user.organization_id,
          session_start: new Date().toISOString(),
          is_active: true,
          duration_seconds: 0,
        })
        .select('id')
        .single();

      if (error) throw error;
      sessionIdRef.current = data.id;
      console.log('[CLIENT_PORTAL_SESSION] createSession success', { sessionId: data.id });
      sessionStartRef.current = Date.now();
      activeTimeRef.current = 0;
      lastActivityRef.current = Date.now();
    } catch (err) {
      console.error('[CLIENT_PORTAL_SESSION] createSession failed', err);
    }
  }, [user, customer]);

  // Update session duration
  const updateSession = useCallback(async () => {
    if (!sessionIdRef.current || !user) return;
    
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
      const { error } = await supabase
        .from('client_portal_sessions')
        .update({
          duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionIdRef.current);

      if (error) throw error;
    } catch (err) {
      console.error('[CLIENT_PORTAL_SESSION] updateSession failed', err);
    }
  }, [user, checkIdle]);

  // End the session
  const endSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    
    // Final activity check
    if (!isIdleRef.current) {
      const now = Date.now();
      activeTimeRef.current += now - lastActivityRef.current;
    }
    
    const durationSeconds = Math.floor(activeTimeRef.current / 1000);
    
    try {
      const { error } = await supabase
        .from('client_portal_sessions')
        .update({
          session_end: new Date().toISOString(),
          duration_seconds: durationSeconds,
          is_active: false,
        })
        .eq('id', sessionIdRef.current);

      if (error) throw error;
    } catch (err) {
      console.error('[CLIENT_PORTAL_SESSION] endSession failed', err);
    }
    
    sessionIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!user || !customer) return;
    console.log('[CLIENT_PORTAL_SESSION] init', { userId: user.id, email: customer.email });

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
      if (sessionIdRef.current) {
        const durationSeconds = Math.floor(activeTimeRef.current / 1000);
        
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/client_portal_sessions?id=eq.${sessionIdRef.current}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({
                session_end: new Date().toISOString(),
                duration_seconds: durationSeconds,
                is_active: false,
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
  }, []);
}
