import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// Check if running in Capacitor native
const isNativePlatform = () => {
  try {
    const win = window as any;
    return win?.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
};

// Lazy load the push notifications plugin
const getPushPlugin = async () => {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    return PushNotifications;
  } catch (error) {
    console.log('[PUSH] Push notifications plugin not available:', error);
    return null;
  }
};

// Generous enough that a legitimately-shown OS prompt awaiting the user's tap
// won't falsely time out, but short enough that a native call that never
// responds surfaces as an error instead of an infinite spinner.
const PERMISSION_TIMEOUT_MS = 20000;

// Race a native call against a timeout so a stalled bridge (no resolve, no
// reject) becomes a visible error. Rejects with `label` context.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s — the native layer never responded`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

type NotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
  onClick?: () => void;
};

export const canUseBrowserNotifications = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const showBrowserNotification = ({ title, body, tag, onClick }: NotificationPayload) => {
  if (!canUseBrowserNotifications() || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });

    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch (error) {
    console.error('[PUSH] Error showing browser notification:', error);
  }
};

export function usePushNotifications(staffId?: string) {
  const [token, setToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const nativeListenersAttachedRef = useRef(false);
  const nativeListenerHandlesRef = useRef<Array<{ remove: () => Promise<void> }>>([]);

  const cleanupNativeListeners = useCallback(async () => {
    if (nativeListenerHandlesRef.current.length === 0) return;

    await Promise.allSettled(nativeListenerHandlesRef.current.map((handle) => handle.remove()));
    nativeListenerHandlesRef.current = [];
    nativeListenersAttachedRef.current = false;
  }, []);

  const attachNativeListeners = useCallback(async () => {
    if (!isNativePlatform() || nativeListenersAttachedRef.current) return;

    const PushNotifications = await getPushPlugin();
    if (!PushNotifications) return;

    const handles = await Promise.all([
      PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        toast.info(notification.title || 'New notification', {
          description: notification.body,
        });
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', (notification: any) => {
        const data = notification.notification.data;
        if (data?.bookingId) {
          window.location.href = `/staff?booking=${data.bookingId}`;
        }
      }),
    ]);

    nativeListenerHandlesRef.current = handles;
    nativeListenersAttachedRef.current = true;
  }, []);

  useEffect(() => {
    // Check support for native or web
    if (isNativePlatform()) {
      setIsSupported(true);
      void checkNativePermission();
      void attachNativeListeners();
    } else if ('Notification' in window) {
      setIsSupported(true);
      if (Notification.permission === 'granted') {
        setIsRegistered(true);
      }
    }
    return () => {
      void cleanupNativeListeners();
    };
  }, [attachNativeListeners, cleanupNativeListeners, staffId]);

  const checkNativePermission = async () => {
    try {
      const PushNotifications = await getPushPlugin();
      if (!PushNotifications) return;
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') {
        setIsRegistered(true);
      }
    } catch {
      // ignore
    }
  };

  const registerNative = async () => {
    const PushNotifications = await getPushPlugin();
    if (!PushNotifications) {
      toast.error('Push notifications are not available on this device');
      return false;
    }

    // requestPermissions() had no timeout: if the native call stalls (no OS
    // prompt, no resolve), the flow hung here forever and the toggle spun with
    // no feedback. Time it out and surface whatever the native layer returns.
    let permStatus: { receive: string };
    try {
      permStatus = await withTimeout(
        PushNotifications.requestPermissions(),
        PERMISSION_TIMEOUT_MS,
        'PushNotifications.requestPermissions()',
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('[PUSH] requestPermissions failed or stalled:', detail);
      toast.error(`Couldn't enable notifications: ${detail}`);
      return false;
    }
    if (permStatus.receive !== 'granted') {
      toast.error('Push notification permission denied');
      return false;
    }

    await attachNativeListeners();

    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let registrationErrorHandle: { remove: () => Promise<void> } | null = null;

    try {
      const nativeToken = await new Promise<string>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error('Push registration timed out. Please try again.'));
        }, 12000);

        (async () => {
          try {
            registrationHandle = await PushNotifications.addListener('registration', (tokenData: { value: string }) => {
              window.clearTimeout(timeoutId);
              resolve(tokenData.value);
            });

            registrationErrorHandle = await PushNotifications.addListener('registrationError', (error: any) => {
              window.clearTimeout(timeoutId);
              reject(new Error(error?.error || 'Failed to register for push notifications'));
            });

            await PushNotifications.register();
          } catch (error) {
            window.clearTimeout(timeoutId);
            reject(error);
          }
        })();
      });

      // Don't log the raw token — it's a credential that can be used to send
      // arbitrary push notifications to this device until it rotates.
      console.log('[PUSH] Push registration success');
      setToken(nativeToken);
      setIsRegistered(true);

      // The device itself is registered with APNs/FCM at this point — that
      // part genuinely succeeded. But if the token never reaches our
      // server, send-push-notification has nothing to send to, so this
      // device won't actually receive anything despite the OS-level
      // registration. Track that distinctly rather than reporting success.
      let tokenSaved = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const { error: saveError } = await supabase.functions.invoke('register-push-token', {
            body: { token: nativeToken, platform: 'ios' },
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (saveError) {
            console.error('[PUSH] Failed to save token', saveError);
          } else {
            tokenSaved = true;
            console.log('[PUSH] Token saved to Supabase');
          }
        }
      } catch (err) {
        console.error('[PUSH] Error saving token', err);
      }

      if (staffId) {
        // Dev placeholder until staff-token persistence is wired up. Never log
        // the actual token alongside the staff id — that's a deanonymizing pair.
        console.log('[PUSH] Push token ready for staff registration');
      }

      if (!tokenSaved) {
        toast.error("Your device registered, but we couldn't save your notification settings. Please try again.");
        return false;
      }

      return true;
    } catch (error) {
      console.error('[PUSH] Push registration error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to register for push notifications');
      return false;
    } finally {
      await Promise.allSettled([
        registrationHandle?.remove() ?? Promise.resolve(),
        registrationErrorHandle?.remove() ?? Promise.resolve(),
      ]);
    }
  };

  const registerWeb = async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setIsRegistered(true);
      return true;
    }
    if (permission === 'denied') {
      toast.error('Notifications blocked. Enable them in your browser settings.');
    }
    return false;
  };

  const requestPermission = useCallback(async () => {
    setIsRegistering(true);
    try {
      let success = false;
      if (isNativePlatform()) {
        success = await registerNative();
      } else if ('Notification' in window) {
        success = await registerWeb();
      } else {
        toast.error('Push notifications are not supported on this device');
      }
      if (success) {
        toast.success('Notifications enabled!');
      }
      return success;
    } catch (error) {
      console.error('[PUSH] Error enabling notifications:', error);
      toast.error('Failed to enable notifications');
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [staffId]);

  return {
    token,
    isSupported,
    isRegistered,
    isRegistering,
    requestPermission,
  };
}
