/**
 * Native OAuth helper for iOS App Store Guideline 4.0 compliance.
 */

import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';

const NATIVE_CALLBACK_URL = 'com.jointidywise.app://auth/callback';
const WEB_CALLBACK_URL = 'https://www.jointidywise.com';

export function getOAuthRedirectUrl(): string {
  return Capacitor.isNativePlatform() ? NATIVE_CALLBACK_URL : WEB_CALLBACK_URL;
}

export async function signInWithOAuthNative(
  provider: 'google' | 'apple'
): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_CALLBACK_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      return { error };
    }

    if (data?.url) {
      // Dynamically import @capacitor/browser to avoid build errors in web-only environments
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({
        url: data.url,
        presentationStyle: 'popover',
      });
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function setupDeepLinkListener(): (() => void) | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;

  const listener = (async () => {
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');

    return App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.includes('auth/callback')) return;

      try {
        await Browser.close();
      } catch {
        // Browser may already be closed
      }

      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return;

      const hashParams = new URLSearchParams(url.substring(hashIndex + 1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    });
  })();

  return () => {
    listener.then(l => l.remove());
  };
}
