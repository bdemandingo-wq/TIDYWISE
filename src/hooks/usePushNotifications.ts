import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

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

  useEffect(() => {
    // Only run on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    setIsSupported(true);
    initPushNotifications();
  }, [staffId]);

  const initPushNotifications = async () => {
    try {
      const PushNotifications = await getPushPlugin();
      if (!PushNotifications) return;

      // Request permission
      const permStatus = await PushNotifications.requestPermissions();
      
      if (permStatus.receive !== 'granted') {
        console.log('Push notification permission denied');
        return;
      }

      // Register with Apple / Google to receive push via APNS/FCM
      await PushNotifications.register();

      // On success, we should receive the token
      PushNotifications.addListener('registration', async (tokenData: { value: string }) => {
        console.log('Push registration success, token:', tokenData.value);
        setToken(tokenData.value);
        
        // Save token to database if we have a staff ID
        if (staffId) {
          await saveTokenToDatabase(tokenData.value);
        }
      });

      // Handle registration errors
      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('Push registration error:', error);
      });

      // Handle incoming notifications when app is in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        console.log('Push notification received:', notification);
        toast.info(notification.title || 'New notification', {
          description: notification.body,
        });
      });

      // Handle notification tap
      PushNotifications.addListener('pushNotificationActionPerformed', (notification: any) => {
        console.log('Push notification action performed:', notification);
        // Navigate to relevant screen based on notification data
        const data = notification.notification.data;
        if (data?.bookingId) {
          window.location.href = `/staff?booking=${data.bookingId}`;
        }
      });
    } catch (error) {
      console.error('Error initializing push notifications:', error);
    }
  };

  const saveTokenToDatabase = async (pushToken: string) => {
    if (!staffId) return;

    try {
      console.log('Would save push token for staff:', staffId, pushToken);
      // Future: save to database
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  };

  const requestPermission = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast.error('Push notifications only work on native apps');
      return false;
    }

    const PushNotifications = await getPushPlugin();
    if (!PushNotifications) return false;

    const permStatus = await PushNotifications.requestPermissions();
    return permStatus.receive === 'granted';
  };

  return {
    token,
    isSupported,
    requestPermission,
  };
}
