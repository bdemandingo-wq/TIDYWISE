import { useEffect, useState, useCallback } from 'react';
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

export function usePushNotifications(staffId?: string) {
  const [token, setToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    // Check support for native or web
    if (isNativePlatform()) {
      setIsSupported(true);
      checkNativePermission();
    } else if ('Notification' in window) {
      setIsSupported(true);
      if (Notification.permission === 'granted') {
        setIsRegistered(true);
      }
    }
  }, [staffId]);

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
    if (!PushNotifications) return false;

    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      toast.error('Push notification permission denied');
      return false;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (tokenData: { value: string }) => {
      console.log('Push registration success, token:', tokenData.value);
      setToken(tokenData.value);
      setIsRegistered(true);
      if (staffId) {
        console.log('Would save push token for staff:', staffId, tokenData.value);
      }
    });

    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('Push registration error:', error);
      toast.error('Failed to register for push notifications');
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      toast.info(notification.title || 'New notification', {
        description: notification.body,
      });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification: any) => {
      const data = notification.notification.data;
      if (data?.bookingId) {
        window.location.href = `/staff?booking=${data.bookingId}`;
      }
    });

    return true;
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
