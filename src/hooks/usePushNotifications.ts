import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

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
    console.log('Push notifications plugin not available:', error);
    return null;
  }
};

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
    console.error('Error showing browser notification:', error);
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

    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      toast.error('Push notification permission denied');
      return false;
    }

    await attachNativeListeners();

    let registrationHandle: { remove: () => Promise<void> } | null = null;
    let registrationErrorHandle: { remove: () => Promise<void> } | null = null;

    try {
      const nativeToken = await new Promise<string>(async (resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error('Push registration timed out. Please try again.'));
        }, 12000);

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
      });

      console.log('Push registration success, token:', nativeToken);
      setToken(nativeToken);
      setIsRegistered(true);

      if (staffId) {
        console.log('Would save push token for staff:', staffId, nativeToken);
      }

      return true;
    } catch (error) {
      console.error('Push registration error:', error);
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
      console.error('Error enabling notifications:', error);
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
