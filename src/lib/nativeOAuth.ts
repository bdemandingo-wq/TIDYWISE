/**
 * Native OAuth helper for iOS App Store Guideline 4.0 compliance.
 * 
 * On native (Capacitor) platforms, OAuth flows must use an in-app browser
 * (SFSafariViewController) instead of redirecting to external Safari.
 * 
 * This module provides:
 * - signInWithOAuthNative: opens OAuth URL in-app via @capacitor/browser
 * - setupDeepLinkListener: listens for the OAuth callback deep link
 */

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';

const NATIVE_CALLBACK_URL = 'com.jointidywise.app://auth/callback';
const WEB_CALLBACK_URL = 'https://www.jointidywise.com';

/**
 * Returns the appropriate redirect URL based on platform
 */
export function getOAuthRedirectUrl(): string {
  return Capacitor.isNativePlatform() ? NATIVE_CALLBACK_URL : WEB_CALLBACK_URL;
}

/**
 * Perform OAuth sign-in using in-app browser on native platforms.
 * Uses Supabase's skipBrowserRedirect to get the OAuth URL,
 * then opens it in SFSafariViewController via @capacitor/browser.
 */
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
      // Open in SFSafariViewController (in-app browser) — NOT external Safari
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

/**
 * Set up a deep link listener to handle the OAuth callback.
 * When the OAuth provider redirects back to com.jointidywise.app://auth/callback,
 * this captures the URL, closes the in-app browser, and sets the Supabase session.
 * 
 * Call this once at app startup (e.g., in main.tsx).
 * Returns a cleanup function to remove the listener.
 */
export function setupDeepLinkListener(): (() => void) | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;

  const listener = App.addListener('appUrlOpen', async ({ url }) => {
    // Only handle our auth callback URLs
    if (!url.includes('auth/callback')) return;

    // Close the in-app browser
    try {
      await Browser.close();
    } catch {
      // Browser may already be closed
    }

    // Extract tokens from the URL fragment (after #)
    // Supabase appends tokens as hash fragments: #access_token=...&refresh_token=...
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

  // Return cleanup function
  return () => {
    listener.then(l => l.remove());
  };
}
