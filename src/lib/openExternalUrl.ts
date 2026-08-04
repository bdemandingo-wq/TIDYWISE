import { Capacitor } from '@capacitor/core';

/**
 * Open a URL outside the app.
 *
 * `window.open(url, '_blank')` does nothing in an iOS WKWebView — the call is
 * ignored, no window appears and no error is thrown, so the button just looks
 * dead. Native has to go through the Capacitor Browser plugin.
 *
 * Lifted out of PaymentIntegrationPage, which had the only correct copy. The
 * same mistake is still live in BuyAiCreditsButton (a bare window.open, so
 * buying AI credits silently does nothing on iOS) and fileActions.ts documents
 * the identical failure for blob previews. One helper so the next caller does
 * not have to rediscover it.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url, presentationStyle: 'popover' });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch {
    // Last resort — navigating away is worse than a new tab, but far better
    // than a control that appears to do nothing.
    window.location.href = url;
  }
}
