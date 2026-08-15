import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/hooks/usePlatform';
import { isStandalone } from '@/lib/installPrompt';
import { shouldOfferAppInstall } from '@/lib/appInstallNudge';

/*
  Dismissal is localStorage, NOT sessionStorage — the opposite of
  EmailIdentityBanner, and on purpose. That banner reports a problem
  ("your customers aren't receiving emails"), so it SHOULD come back every
  session until the problem is fixed. This one is an invitation. Someone who
  closes it has answered the question, and asking again next Tuesday is nagging.

  One key, no per-mode suffix: there is only one thing to decline here.
*/
const DISMISS_KEY = 'tw_get_the_app_dismissed';

/**
 * A one-line nudge toward /get-the-app, for people who are only ever in a
 * browser tab.
 *
 * Who it skips, and the trap in that, lives in shouldOfferAppInstall — pulled
 * out and tested because "an installed PWA also reports isWeb" is the kind of
 * rule that gets quietly simplified back into a bug.
 *
 * `standalone` is read once at mount rather than subscribed: it cannot change
 * without a navigation — you do not become standalone inside a live tab — and
 * GetTheAppPage reads it the same way.
 */
export function GetTheAppBanner() {
  const { isWeb } = usePlatform();
  const [standalone] = useState<boolean>(isStandalone);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    // Reading localStorage THROWS, not returns null, in some privacy modes.
    // Unguarded that is a render-time exception on the dashboard — the whole
    // page gone, to decide whether to show one optional row.
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!shouldOfferAppInstall({ isWeb, standalone, dismissed })) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private mode / quota. Hiding it for this session is still the right
      // response to a click; it just comes back next time. Better than the
      // click appearing to do nothing.
    }
    setDismissed(true);
  };

  return (
    // Wraps rather than crushes: on a phone-width browser the text keeps the
    // first line and the two controls drop to their own, instead of squeezing
    // the button down to an unreadable sliver.
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <Smartphone className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      <p className="min-w-[14rem] flex-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">TidyWise runs on your phone and desktop too.</span>{' '}
        Same account, same data, wherever you're working.
      </p>
      <div className="ml-auto flex flex-shrink-0 items-center gap-1">
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/get-the-app">Get the app</Link>
        </Button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded p-1 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
