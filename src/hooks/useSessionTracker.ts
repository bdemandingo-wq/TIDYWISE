import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes of inactivity = idle
const UPDATE_INTERVAL_MS = 30 * 1000; // Update session every 30 seconds

export function useSessionTracker() {
  const { user } = useAuth();
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
    if (!user) return;
    
    try {
      console.log('[SESSION_TRACKER] createSession start', { userId: user.id, email: user.email });
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          user_email: user.email,
          session_start: new Date().toISOString(),
          is_active: true,
          duration_seconds: 0,
        })
        .select('id')
        .single();

      if (error) throw error;
      sessionIdRef.current = data.id;
      console.log('[SESSION_TRACKER] createSession success', { sessionId: data.id, userId: user.id, email: user.email });
      sessionStartRef.current = Date.now();
      activeTimeRef.current = 0;
      lastActivityRef.current = Date.now();
    } catch (err) {
      console.error('[SESSION_TRACKER] createSession failed', { userId: user.id, email: user.email, err });
    }
  }, [user]);

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
        .from('user_sessions')
        .update({
          duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionIdRef.current);

      if (error) throw error;
    } catch (err) {
      console.error('[SESSION_TRACKER] updateSession failed', {
        sessionId: sessionIdRef.current,
        userId: user.id,
        email: user.email,
        durationSeconds,
        err,
      });
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
        .from('user_sessions')
        .update({
          session_end: new Date().toISOString(),
          duration_seconds: durationSeconds,
          is_active: false,
        })
        .eq('id', sessionIdRef.current);

      if (error) throw error;
    } catch (err) {
      console.error('[SESSION_TRACKER] endSession failed', {
        sessionId: sessionIdRef.current,
        durationSeconds,
        err,
      });
    }
    
    sessionIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!user) return;
    console.log('[SESSION_TRACKER] init', { userId: user.id, email: user.email });

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
  }, [user, createSession, handleActivity, updateSession, endSession, checkIdle]);

  // Handle page unload - use fetch with keepalive for proper auth headers
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (sessionIdRef.current) {
        const durationSeconds = Math.floor(activeTimeRef.current / 1000);
        
        // Use fetch with keepalive - sendBeacon doesn't support auth headers
        try {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sessionIdRef.current}`,
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
              keepalive: true, // Ensures request completes even after page closes
            }
          );
        } catch {
          // Silently fail on unload - can't do much here
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
