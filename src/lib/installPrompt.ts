/**
 * Captures Chrome/Edge's `beforeinstallprompt` so a real Install button can
 * trigger the install directly, instead of telling people to hunt in the
 * address bar.
 *
 * WHY THIS IS A MODULE AND NOT A HOOK: the event fires early — routinely before
 * React has mounted — and it fires exactly once. A listener attached when a
 * component mounts misses it, and the button then never appears no matter how
 * installable the app is. `init()` runs from main.tsx at bootstrap and parks the
 * event here for whoever asks later.
 *
 * Safari never fires it, on any platform. That is not a bug to work around: it
 * is why the UI shows Safari users an instruction rather than a button that
 * could not work.
 */

/** Not in lib.dom yet. Only the two members we use. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/**
 * True when the page is running as an installed app rather than a browser tab.
 *
 * `display-mode: standalone` matches the manifest's display value. The
 * `navigator.standalone` fallback is iOS Safari's own, non-standard flag, which
 * is the only signal there for a home-screen install.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function initInstallPrompt(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Chrome shows its own mini-infobar unless this is prevented. We want the
    // install to happen from our button, at a moment the person chose.
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });

  // Fires whether the install came from our button or the browser's own menu,
  // so the button disappears either way rather than sitting there inert.
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export function subscribeInstallPrompt(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * Snapshot for useSyncExternalStore. Cached because that hook compares by
 * reference and a fresh object every call would loop forever.
 */
let snapshot = { canInstall: false, isInstalled: false };
export function getInstallSnapshot(): typeof snapshot {
  const canInstall = deferredPrompt !== null && !installed;
  const isInstalled = installed || isStandalone();
  if (canInstall !== snapshot.canInstall || isInstalled !== snapshot.isInstalled) {
    snapshot = { canInstall, isInstalled };
  }
  return snapshot;
}

/**
 * Shows the browser's install dialog. Returns what the person chose, or
 * 'unavailable' when there was no captured event to show.
 *
 * The event is single-use: once prompted it cannot be reused, so it is cleared
 * either way. Chrome re-fires beforeinstallprompt on a later visit if the
 * person declined, which is what restores the button.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = deferredPrompt;
  if (!evt) return 'unavailable';
  deferredPrompt = null;
  emit();
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    return outcome;
  } catch {
    return 'unavailable';
  }
}
