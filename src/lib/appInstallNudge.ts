/**
 * Whether to offer someone the "get the app" nudge.
 *
 * Pulled out of the component because the interesting part is a rule, not a
 * render, and the rule has one trap in it worth pinning down in a test:
 *
 * **Capacitor reports the platform as `'web'` inside an installed PWA.** So
 * `!isNative` on its own is TRUE for a desktop user who already installed
 * TidyWise and is reading this in its own window — the one group the nudge
 * must never reach, because it is asking them to do the thing they did.
 * `standalone` (display-mode, or iOS Safari's `navigator.standalone`) is the
 * only thing that separates an installed app window from a browser tab.
 *
 * What it cannot see: a native install on a DIFFERENT device. Someone with the
 * iPhone app open on their phone still gets the nudge in their laptop browser,
 * and no client-side signal can fix that — the dismiss button is the answer.
 */
export interface AppInstallNudgeState {
  /** Capacitor's platform is 'web' — i.e. not the native iOS/Android shell. */
  isWeb: boolean;
  /** Running as an installed app (PWA window or iOS home-screen), not a tab. */
  standalone: boolean;
  /** They already closed it. Persisted; see GetTheAppBanner. */
  dismissed: boolean;
}

export function shouldOfferAppInstall({
  isWeb,
  standalone,
  dismissed,
}: AppInstallNudgeState): boolean {
  if (!isWeb) return false;
  if (standalone) return false;
  if (dismissed) return false;
  return true;
}
