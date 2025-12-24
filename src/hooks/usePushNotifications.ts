import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
      // Request permission
      const permStatus = await PushNotifications.requestPermissions();
      
      if (permStatus.receive !== 'granted') {
        console.log('Push notification permission denied');
        return;
      }

      // Register with Apple / Google to receive push via APNS/FCM
      await PushNotifications.register();

      // On success, we should receive the token
      PushNotifications.addListener('registration', async (token: Token) => {
        console.log('Push registration success, token:', token.value);
        setToken(token.value);
        
        // Save token to database if we have a staff ID
        if (staffId) {
          await saveTokenToDatabase(token.value);
        }
      });

      // Handle registration errors
      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('Push registration error:', error);
      });

      // Handle incoming notifications when app is in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('Push notification received:', notification);
        toast.info(notification.title || 'New notification', {
          description: notification.body,
        });
      });

      // Handle notification tap
      PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
        console.log('Push notification action performed:', notification);
        // Navigate to relevant screen based on notification data
        const data = notification.notification.data;
        if (data?.bookingId) {
          // Could use router to navigate
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
      // For now, we'll store this in staff notes or a dedicated field
      // You might want to create a push_tokens table for this
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

    const permStatus = await PushNotifications.requestPermissions();
    return permStatus.receive === 'granted';
  };

  return {
    token,
    isSupported,
    requestPermission,
  };
}
