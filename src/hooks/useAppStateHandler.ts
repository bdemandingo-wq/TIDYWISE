import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export function useAppStateHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    const init = async () => {
      const { App } = await import('@capacitor/app');

      const resumeListener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          try {
            await supabase.auth.refreshSession();
          } catch {
            // Non-fatal
          }
        }
      });

      const backListener = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
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
